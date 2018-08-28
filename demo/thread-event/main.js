// const thread = require(__dirname+'/../../lib/thread')
const thread = require('thread')

// 创建线程
var worker = thread.run(__dirname+'/thread.js')

// 订阅事件
var listener = worker.on('timer', function(t){
    console.log('timer:', t, 'from tid:', this.id)
})

// 订阅一次性事件
worker.once('timer', function(t){
    // this 表示触发事件的线程对象
    console.log('once timer:', t, t, 'from tid:', this.id)
})

// 每隔3秒, 改变事件监听状态(监听或不监听)
var listening = true
setInterval(()=>{
    if(listening) {
        console.log("off timer")
        listener.off() // 停止监听事件
    }
    else {
        console.log("on timer")
        listener.on() // 继续监听事件        
    }

    listening = !listening
}, 3000)



thread.alive()