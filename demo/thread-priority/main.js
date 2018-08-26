const thread = require('thread')

var worker = thread.run(__dirname+'/thread.js')

var number = 0

// 最低 优先级 （子线程最后处理）
for(var i=0; i<10; i++){
    worker.send(0, "number", number++)
}
// 默认优先级
for(var i=0; i<10; i++){
    worker.send("number", number++)
}
// 最高 优先级 （子线程最先处理）
for(var i=0; i<10; i++){
    worker.send(5, "number", number++)
}

thread.alive()