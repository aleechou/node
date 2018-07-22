const buildin = process.binding('thread')
const util = require('util')
const EventEmitter = require('events').EventEmitter

if(process.argv[2]) {
    try{
        exports.argv = JSON.parse(process.argv[2])
    }catch(e) {
        console.error(e)
    }
}

var thisThreadId = undefined
var cacheModules = {}
var cacheThreads = {}

function Thread(id) {
    this.id = id
}
util.inherits(Thread, EventEmitter)

exports.hasRequired = buildin.hasNativeModuleLoaded
exports.sendMessage = buildin.sendMessage

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

exports.run = function(path, argv) {
    var tid = buildin.run(path, argv==undefined? '{}': JSON.stringify(argv))
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
    buildin.sendMessage(
        this.id, 
        `global.__$thread_message_arrived_cb && global.__$thread_message_arrived_cb.apply(null, ${strargv})`
    )
}

var msgDipatcher = new EventEmitter

exports.message = function(msg, callback) {
    msgDipatcher.on(msg, callback)
}
exports.messageOnce = function(msg, callback) {
    msgDipatcher.once(msg, callback)
}
exports.alive = function() {
    setInterval(()=>{},1000)
}

global.__$thread_message_arrived_cb = function(msg, from, ...argv) {
    msgDipatcher.emit(msg, exports.fromId(from), ...argv)
}