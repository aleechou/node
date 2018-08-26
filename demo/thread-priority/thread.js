const {thread} = require('../../src/native')

thread.message('number', (num)=>{
    console.log("received number:", num)
})

thread.alive()