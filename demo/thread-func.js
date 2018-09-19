if(process.argv.includes("-d"))
    var thread = require(__dirname+'/../lib/thread')
else
    var thread = require('thread')

// 创建线程,　并发回消息
thread.run(function(){
        var thread = require('thread')
        console.log("thisis child thread.")
        thread.main().send('hello', Date.now())
    })
    

// 接收消息
thread.message('hello', console.log)

thread.alive()