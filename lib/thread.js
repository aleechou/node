const buildin = process.binding('thread')
buildin.initMessageAsync()

const util = require('util')
const EventEmitter = require('events').EventEmitter

var thisThreadId = undefined
var cacheModules = {}
var cacheThreads = {}

var msgRouter = new EventEmitter    // 消息传递
// var msgRejector = new EventEmitter


function Thread(id) {
    this.id = id
    this._eventEmitter = new EventEmitter
}
exports.Thread = Thread
util.inherits(Thread, EventEmitter)

exports.hasRequired = buildin.hasNativeModuleLoaded
exports.sleep = buildin.sleep
exports.msleep = buildin.msleep
exports.usleep = buildin.usleep
exports.usec = buildin.usec

function currentId () {
    if( thisThreadId==undefined ) {
        thisThreadId = buildin.currentThreadId() ;
    }
    return thisThreadId
}

exports.isMain = function() {
    return currentId() == 0
}
exports.current = function() {
    return exports.fromId(currentId())
}

exports.fromId = function(id) {
    if(!cacheThreads[id]) {
        cacheThreads[id] = new Thread(id)
    }
    return cacheThreads[id]
}
exports.main = function() {
    return exports.fromId(0)
}

exports.run = function(pathOrFunc, argv) {
    if( typeof pathOrFunc=='function' ) {
        if(!argv)
            argv = []
        else if( !(argv instanceof Array) )
            argv = [argv]
        var script = "(" + pathOrFunc.toString() + ") (..." + JSON.stringify(argv) + ")"
        var tid = buildin.run(script, null, true)
    }
    else {
        var tid = buildin.run(pathOrFunc, argv==undefined? '{}': JSON.stringify(argv), false)
    }
    return exports.fromId(tid)
}

exports.require = function(moduleName) {
    if( !cacheModules[moduleName] ){
        var module = { exports: {} }
        cacheModules[moduleName] = buildin.initNativeModule('MotionAnalysorNative', module) ;
    }
    return cacheModules[moduleName]
}

function wrapMessageCallback(callback) {
    return function(from, ...argv) {
        callback.apply( exports.fromId(from), argv )
    }
}

exports.message = function(msg, callback) {
    msgRouter.on(msg, wrapMessageCallback(callback))
}
exports.messageOnce = function(msg, callback) {
    msgRouter.once(msg, wrapMessageCallback(callback))
}

Thread.prototype.send = function(msg, ...argv) {
    // 第一个参数为整数表示消息的优先级
    if( Number.isInteger(arguments[0]) ){
        return sendWithPriority(this.id, ...arguments)
    }
    else {
        return sendWithPriority(this.id, 3, msg, ...argv)
    }
}

function sendWithPriority(to, priority, msg, ...argv) {
    argv.unshift(currentId())
    argv.unshift(msg)
    var strargv = JSON.stringify(argv)
    return buildin.sendMessage( to, strargv, priority )
}

Thread.prototype.on = function(eventName, callback) {
    this.send('~@listen-event', eventName, false)
    this._eventEmitter.on(eventName, wrapMessageCallback(callback))
}
Thread.prototype.once = function(eventName, callback) {
    this.send('~@listen-event', eventName, true)
    this._eventEmitter.once(eventName, wrapMessageCallback(callback))
}

exports.emit = function(event, ...argv) {
    ([threadEventListners, threadEventOnceListners]).forEach(listners=>{
        if( listners[event] ){
            listners[event].forEach(thread=>{
                thread.send('~@emit-event', event, ...argv)
            })
        }
    })

    // 清理 once listner
    delete threadEventOnceListners[event]
}
const threadEventListners = {}
const threadEventOnceListners = {}
exports.message('~@listen-event', function(eventName, once) {
    var listners = once? threadEventOnceListners: threadEventListners
    if( !listners[eventName] )
        listners[eventName] = []
    if( !listners[eventName].includes(this) )
        listners[eventName].push(this)
})

msgRouter.on('~@emit-event', (from, eventName, ...argv)=>{
    exports.fromId(from)._eventEmitter.emit(eventName, from, ...argv)
})



exports.alive = function(msec) {
    setInterval(global.__$thread_message_pump,msec||0)
}

global.__$thread_message_pump = function() {
    while(1) {
        var msg = buildin.popMessage() 
        if(msg==undefined) {
            return
        }
        pump_once(msg, msgRouter)
    }
}

function pump_once(msg, emitter) {
    try{
        var argv = JSON.parse(msg)
    } catch(e) {
        console.error(e)
        console.error(msg)
    }
    var msgName = argv.shift()
    var from = argv.shift()

    if(!emitter.listenerCount(msgName)) {
        console.log('no router for message', msgName, 'on thread', currentId())
    }
    emitter.emit(msgName, from, ...argv)
}

if(!exports.isMain() && process.argv[2]) {
    try{
        exports.argv = JSON.parse(process.argv[2])
    }catch(e) {
        console.log(process.argv[2])
        console.error(e)
    }
}