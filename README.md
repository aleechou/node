这是一个多线程版本的 Nodejs，适合计算型的项目(例如：opencv4nodejs : https://github.com/justadudewhohacks/opencv4nodejs)。

从 nodejs 10.x fork 出来。

每个 js 线程都是独立的 v8::Isolate，不共享任何 js 资源；但是 c++ module 中的资源是可以共享的，可以使用一些c++技巧，在不同 js 线程间共享资源。例如在保证安全的情况下，将内存指针在不同 js 线程之间传递。


## 安装

```bash
git clone https://github.com/aleechou/threadable-node.git
cd threadable-node
./configure
make -j8
sudo make install
```

## 多线程 JS 例子

主线程文件：main.js
```javascript
const thread = require('thread')

// 启动子线程
thread.run('/path/to/child.js')

// 接收来自子线程的消息
var child = thread.message('timer', (child, number)=>{
    console.log(`received message: ${number}, from thread id ${child.id}`)
})

console.log(`child thread has launched, thread id is ${child.id}`)

// 保持主线程不退出，并及时处理消息队列
thread.alive()
```

子线程文件：child.js
```javascript
const thread = require('thread')

console.log('this is child thread，thread id is', thread.id)

var number = 0
setInterval(()=>{
    // 向主线程发送消息
    thread.main().send('timer', number++)
}, 1000)

thread.alive()
```


# API

模块引入： 
`const thread = require('thread')`

js 源文件： https://github.com/aleechou/threadable-node/blob/threadable/lib/thread.js

* thread
    * argv
    * currentId()
    * isMain()
    * current()
    * fromId()
    * main()
    * run()
    * require()
    * hasRequired()
    * message()
    * messageOnce()
    * emit()
    * alive()
    * unalive()
    * sleep()
    * msleep()
    * usleep
    * usec()
    * 类 Thread
        * id 
        * prototype.send()
        * prototype.exit()
        * prototype.on()
        * prototype.once()
        * prototype.isRunning()


## 静态函数

* JS属性:  Object `thread.argv`

    thread.run() 启动当前线程时，传入的参数 

* JS函数： int `thread.currentId`()

    返回当前线程的id


* JS函数： bool `thread.isMain`()

    当前线程是否为主线程

* JS函数： Thread `thread.current`()

    返回代表当前线程的 Thread 对象

* JS函数： Thread `thread.fromId`(int tid)
  
    返回代表当前子线程的 Thread 对象， 参数 `tid` 为子线程id ；

    > 该函数返回的 Thread对象，是以 tid 为 key 的享员(Flyweight)对象，相同的 tid 会返回同一个对象

* JS函数： Thread `thread.main`()

    返回代表主线程的 Thread对象，如果当前线程即为主线程，则 `thread.main() == thread.current()`

* JS函数： Thread `thread.run`(string path, Object argv)

    开始执行一个子线程，并返回代表该线程的 Thread

* JS函数： Object `thread.require`(string moduleName)

    在当前线程中载入一个在其他线程中，通过 nodejs 的`require()`函数，已经加载过的 c++ 模块
    
    不同于 nodejs 的 `require` 函数，`thread.require()` 的参数是 模块名称，而不是模块路径。

    > 模块名称是nodejs宏 `NODE_MODULE` 的第一个参数


* JS函数： bool `thread.hasRequired`(string moduleName)

    检查一个模块，是否在其他线程中加载过。如果已经加载过，则需要使用 `thread.require()` 函数，否则使用 nodejs 的 `require()` 函数


* JS函数： void `thread.message`(string messageName, callback(...argv) )
* JS函数： void `thread.messageOnce`(string messageName, callback(...argv) )

    接收来自其他线程的消息

    callback 会在一个代表来源线程的 Thread 对象上被调用；因此，可以使用 `this.id` 了解消息来源，以及 `this.send()` 来回复消息，例如：

    > ```javascript
    > thread.message('frame', (frame)=>{
    >
    >    native.imshow('video', frame)
    >    frame.release()
    >
    >    this.send('receiption')
    >})
    >```

* JS函数： void `thread.emit`(string eventName, ...argv )

    触发当前线程的事件，在其他线程中用 Thread.on() / once() 订阅

    > 线程事件的例子：[https://github.com/aleechou/threadable-node/tree/threadable/demo/thread-event]

* JS函数： void `thread.alive`(int msec)

    保持线程运行(空转),并随时接收其他线程的消息, msec 默认 0毫秒
    
* JS函数： void `thread.unalive`(int msec)

    退出由 `thread.alive()` 开启的线程空转循环. 当线程没有任何未决的事件时,线程自动退出
    

## 线程类 thread.Thread

* JS类构造函数： `Thread`(int tid)

    tid 为线程id


* JS类构造函数： `Thread.isRunning`()

    检查该线程是否退出

* JS类方法：bool,undefined `Thread.send`([int priority,] string messageName, ...argv)

    向线程发送消息

    * 如果 thread.id 错误，该线程不存在，或者已经结束，则返回 `undefined`；
    * 如果目标线程消息队列满，返回 `false`
    * 成功写入目标线程的消息队列，返回 `true`；但不保证被处理，目标线程没有对应的 listener 函数，则消被丢弃
    * 参数 `priority` 是可以省略的，如果第一个参数为整数，则表示消息的优先级， 否则优先级默认为3; `priority` 的范围为 0-5 ，数值大代表优先级高，线程从高到底先后处理队列里的消息

    > 注意：在开发 c++ module 项目时，如果消息里包含堆上的内容，务必保证被正确处理，以免造成内存泄露

    > 线程消息优先级的例子：[https://github.com/aleechou/threadable-node/tree/threadable/demo/thread-priority]


* JS类方法：void `Thread.on`(string eventName, function callback)
* JS类方法：void `Thread.once`(string messageName, function callback)

    订阅该线程的事件，callback 参数和 thread.message() 函数相同。

    > 线程事件的例子：[https://github.com/aleechou/threadable-node/tree/threadable/demo/thread-event]



## 杂项函数
exports.sleep = buildin.sleep
exports.msleep = buildin.msleep
exports.usleep = buildin.usleep
exports.usec = buildin.usec

* JS函数： void `sleep`(int sec)
  
    当前线程堵塞 `sec` 秒

* JS函数： void `msleep`(int msec)
  
    当前线程堵塞 `msec` 毫秒

* JS函数： void `usleep`(int usec)
  
    当前线程堵塞 `usec` 微秒
    
* JS函数： int `usec`()
  
    返回当前时间的微秒值，用于补充 js 内置函数 Date.now() 的计时精度
    