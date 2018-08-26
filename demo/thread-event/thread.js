const thread = require('thread')

setInterval(()=>{

    thread.emit('timer', Date.now())

}, 1000)

thread.alive()