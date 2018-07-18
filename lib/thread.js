const buildin = process.binding('thread')
const util = require('util')
const EventEmitter = require('events').EventEmitter

function Thread(id) {
    this.id = id
}
util.inherits(Thread, EventEmitter)


exports.current = function() {
    var tid = buildin.currentThreadId() ;
    if(tid==undefined)
        return
    return new Thread(tid) ;
}
exports.run = function(path) {
    var tid = buildin.run(path)
    return new Thread(tid)
}

Thread.prototype.send = function() {

}