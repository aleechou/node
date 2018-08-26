const {thread} = require('../../src/native')


setInterval(()=>{

    thread.emit('timer', Date.now())

}, 1000)

thread.alive()