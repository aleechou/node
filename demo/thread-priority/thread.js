const thread = require('thread')

thread.message('number', (num)=>{
    console.log("received number:", num)
})

thread.alive()