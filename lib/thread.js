const buildin = process.binding('thread')
const util = require('util')
const EventEmitter = require('events').EventEmitter

var thisThreadId = undefined
var thisThread = undefined
var cacheModules = {}

function Thread(id) {
    this.id = id
}
util.inherits(Thread, EventEmitter)

exports.isMain = function() {
    return exports.current().id == -1
}

exports.current = function() {
    if(thisThread)
        return thisThread

    if( thisThreadId==undefined ) {
        thisThreadId = buildin.currentThreadId() ;
    }

    thisThread = new Thread(thisThreadId)
    return thisThread
}
exports.run = function(path) {
    var tid = buildin.run(path)
    return new Thread(tid)
}

exports.require = function(moduleName) {
    if( !cacheModules[moduleName] ){
        var module = { exports: {} }
        cacheModules[moduleName] = buildin.initNativeModule('MotionAnalysorNative', module) ;
    }
    return cacheModules[moduleName]
}

Thread.prototype.send = function() {

}