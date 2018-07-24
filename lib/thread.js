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
    return new Thread(tid)
}

exports.require = function(moduleName) {
    if( !cacheModules[moduleName] ){
        var module = { exports: {} }
        cacheModules[moduleName] = buildin.initNativeModule('MotionAnalysorNative', module) ;
    }
    return cacheModules[moduleName]
}

Thread.prototype.send = function(msg, ...argv) {
    argv.unshift(currentId())
    argv.unshift(msg)
    var strargv = JSON.stringify(argv)
    return buildin.sendMessage( this.id, strargv )
}
// Thread.prototype.rejection = function(msg, callback) {
//     msgRejector.on(msg, callback)
// }

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

// global.__$thread_message_rejection = function(msg) {
//     pump_once(msg, msgRejector, (msgName, ...argv, from, to)=>{
//         console.error(`线程 ${from} 发送到线程 ${to} 的消息 ${msgName} 被弹回了，并且发送线程没有处理被拒绝的消息；弹回可能是由于目标线程繁忙且消息队列堵满导致。未处理消息如果包含了堆上的数据，则会造成内存泄漏；应该在发送线程用 thread.rejection() 处理被拒绝的消息。`)
//     })
// }

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