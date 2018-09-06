const buildin = process.binding('thread')
buildin.initMessageAsync()

exports.version = '1.0.2'
exports.lastModify = '2018.09.06'

const PRIO = {
    min: 0,
    normal: 3,
    max: 5
}


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

exports.require = function(moduleName, nativePath, require) {

    if( !cacheModules[moduleName] ){
        // 在其他线程已经加载过这个动态连接库
        if( exports.hasRequired(moduleName) ){
            var module = { exports: {} }
            cacheModules[moduleName] = buildin.initNativeModule(moduleName, module)
        }
        else {
            cacheModules[moduleName] = require(nativePath)
        }
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
    return this.sendWithPriority(PRIO.normal, msg, ...argv)
}

Thread.prototype.sendWithPriority = function(priority, msg, ...argv) {
    argv.unshift(currentId())
    argv.unshift(msg)
    var strargv = JSON.stringify(argv)
    return buildin.sendMessage( this.id, strargv, priority )
}

// function sendWithPriority(to, priority, msg, ...argv) {
//     argv.unshift(currentId())
//     argv.unshift(msg)
//     var strargv = JSON.stringify(argv)
//     return buildin.sendMessage( parseInt(to), strargv, priority )
// }

Thread.prototype.isRunning = function() {
    return buildin.isRunning(this.id)
}

// 线程退出时，停止监听该线程的所有事件
Thread.prototype._listenExit = function() {
    if( !this._listenEvents ++ ){
        this.on(PRIO.max, 'exit', function() {
            this._eventEmitter.removeAllListeners()
        })
    }
}

Thread.prototype.on = function(eventName, callback) {
    return this._listenEvent(PRIO.normal, eventName, callback, false)
}
Thread.prototype.once = function(eventName, callback) {
    return this._listenEvent(PRIO.normal, eventName, callback, true)
}
Thread.prototype.onWithPriority = function(priority, eventName, callback) {
    return this._listenEvent(priority, eventName, callback, false)
}
Thread.prototype.onceWithPriority = function(priority, eventName, callback) {
    return this._listenEvent(priority, eventName, callback, true)
}

Thread.prototype._listenEvent = function(priority, eventName, callback, once) {

    var handler = wrapMessageCallback(callback)

    var listenEvent = () => {
        this.sendWithPriority(PRIO.max, '~@listen-event', eventName, priority)
        this._eventEmitter[once?"once":"on"](eventName, handler)
        this._listenExit()
    }

    listenEvent()

    return {
        off: ()=>{

            this._eventEmitter.off(eventName, handler)

            if(!this._eventEmitter.listenerCount(eventName)) {
                this.sendWithPriority(PRIO.max, '~@unlisten-event', eventName)
            }
        },

        on: listenEvent
    }
}


exports.emit = function(event, ...argv) {
    if( threadEventListners[event] ){
        for(var tid in threadEventListners[event]) {
            var priority = threadEventListners[event][tid]
            exports.fromId(tid).sendWithPriority(parseInt(priority), '~@emit-event', event, ...argv)
        }
    }
}
const threadEventListners = {}
exports.message('~@listen-event', function(eventName, priority) {
    if(priority==undefined)
        priority = PRIO.normal
    if( !threadEventListners[eventName] )
    threadEventListners[eventName] = {}
    threadEventListners[eventName][this.id] = parseInt(priority)
})
exports.message('~@unlisten-event', function(eventName) {
    if( !threadEventListners[eventName] ) return
    delete threadEventListners[eventName][this.id]
})

msgRouter.on('~@emit-event', (from, eventName, ...argv)=>{
    var thread = exports.fromId(from)
    thread._eventEmitter.emit(eventName, from, ...argv)

    if(!thread._eventEmitter.listenerCount(eventName)) {
        thread.sendWithPriority(PRIO.max, '~@unlisten-event', eventName)
    }
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