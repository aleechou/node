const {thread} = require('../../src/native')

var worker = thread.run('thread.js')

worker.on('timer', function(t){
    console.log('timer:', t, 'from tid:', this.id)
})
worker.once('timer', function(t){
    console.log('once timer:', t, t, 'from tid:', this.id)
})

thread.alive()