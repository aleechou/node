const buildin = process.binding('thread')
buildin.initMessageAsync()

exports.version = '1.0.1'

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
    this._listenEvents = 0
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
    return buildin.sendMessage( parseInt(to), strargv, priority )
}

Thread.prototype.isRunning = function() {
    return buildin.isRunning(this.id)
}

// 线程退出时，停止监听该线程的所有事件
Thread.prototype._listenExit = function() {
    if( !this._listenEvents ++ ){
        this.on('exit', function() {
            this._eventEmitter.removeAllListeners()
        })
    }
}

Thread.prototype.on = function() {
    if( Number.isInteger(arguments[0]) ) {
        var priority = arguments[0]
        var eventName = arguments[1]
        var callback = arguments[2]
    }
    else {
        var priority = 3
        var eventName = arguments[0]
        var callback = arguments[1]
    }
    this.send('~@listen-event', eventName, false, priority)
    this._eventEmitter.on(eventName, wrapMessageCallback(callback))
    this._listenExit()
}
Thread.prototype.once = function() {
    if( Number.isInteger(arguments[0]) ) {
        var priority = arguments[0]
        var eventName = arguments[1]
        var callback = arguments[2]
    }
    else {
        var priority = 3
        var eventName = arguments[0]
        var callback = arguments[1]
    }
    this.send('~@listen-event', eventName, true, priority)
    this._eventEmitter.once(eventName, wrapMessageCallback(callback))
    this._listenExit()
}

exports.emit = function(event, ...argv) {
    ([threadEventListners, threadEventOnceListners]).forEach(listners=>{
        if( listners[event] ){
            for(var tid in listners[event]) {
                var priority = listners[event][tid]
                sendWithPriority(tid, priority, '~@emit-event', event, ...argv)
            }
        }
    })

    // 清理 once listner
    delete threadEventOnceListners[event]
}
const threadEventListners = {}
const threadEventOnceListners = {}
exports.message('~@listen-event', function(eventName, once, priority) {
    if(priority==undefined)
        priority = 3
    var listners = once? threadEventOnceListners: threadEventListners
    if( !listners[eventName] )
        listners[eventName] = {}
    listners[eventName][this.id] = priority
})


msgRouter.on('~@emit-event', (from, eventName, ...argv)=>{
    exports.fromId(from)._eventEmitter.emit(eventName, from, ...argv)
})


var alivetimer = null
exports.alive = function(msec) {
    alivetimer = setInterval(global.__$thread_message_pump,msec||0)
}
exports.unalive = function() {
    if( alivetimer ) {
        clearInterval(alivetimer)
        alivetimer = null
    }
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

process.on('exit', (code) => {
    exports.emit('exit', currentId(), code)
})

if(!exports.isMain() && process.argv[2]) {
    try{
        exports.argv = JSON.parse(process.argv[2])
    }catch(e) {
        console.log(process.argv[2])
        console.error(e)
    }
}