#include "node_thread.h"
#include "env-inl.h"
#include "node_internals.h"
#include <iostream>
#include <unordered_map>
#include <v8.h>
#include <uv.h>
#include <unistd.h>
#include <sys/time.h>

#define out std::cout << "(@" << __LINE__ << ") " <<
#define nl << std::endl ;

namespace node {

namespace Thread {

using v8::Context;
using v8::Isolate;
using v8::Local;
using v8::Value;
using v8::Object;
using v8::FunctionCallback;
using v8::FunctionCallbackInfo;

unsigned int assigned_thread_id = 0;

std::vector<thread_data*> gThreadPool ;

inline std::vector<thread_data*>::iterator FindThreadPos(uv_thread_t thread) {
    for(std::vector<thread_data*>::iterator it=gThreadPool.begin(); it!=gThreadPool.end(); it++)
    {
        if(uv_thread_equal(&(*it)->thread, &thread)) {
            return it ;
        }
    }
    return gThreadPool.end() ;
}
inline std::vector<thread_data*>::iterator FindThreadPos(unsigned int id) {
    for(std::vector<thread_data*>::iterator it=gThreadPool.begin(); it!=gThreadPool.end(); it++) {

        if((*it)->id == id) {
            return it ;
        }
    }
    return gThreadPool.end() ;
}
bool IsValid(std::vector<thread_data*>::iterator it) {
    return it != gThreadPool.end() ;
}


thread_data * FindThread(uv_thread_t thread) {
    auto it = FindThreadPos(thread) ;
    return it==gThreadPool.end()? nullptr: (*it) ;
}
thread_data * FindThread(unsigned int id) {
    auto it = FindThreadPos(id) ;
    return it==gThreadPool.end()? nullptr: (*it) ;
}
v8::Isolate* CurrentIsolate() {
    auto tdata = FindThread(uv_thread_self()) ;
    return tdata==nullptr? nullptr: tdata->isolate ;
}


struct async_data {
    thread_data * to;
    std::string script;
} ;

void async_message_awake(uv_async_t* async) {

    v8::Isolate * isolate = (v8::Isolate *) async->data ;

    out "async_message_awake()" nl

    v8::Locker locker(isolate) ;
    v8::HandleScope scope(isolate);
    v8::Script::Compile ( v8::String::NewFromUtf8(isolate, "global.__$thread_message_pump && global.__$thread_message_pump()") )->Run();
}

thread_data * create_thread_data(uv_loop_t * loop) {
    thread_data * tdata = new thread_data ;
    tdata->id = assigned_thread_id ++ ;
    tdata->loop = loop ;

    // 参数
    tdata->args.push_back("node") ;
    tdata->exec_args.push_back("child") ;

    // 创建消息队列( 0-5. 默认3)
    for(int p=0; p<6; p++) {
        tdata->messageQueues.push_back( std::vector<std::string>() );
    }

    uv_mutex_init(&tdata->message_mutex) ;
    tdata->message_async.data = nullptr ;

    return tdata ;
}

static void newthread(void* arg) {

    thread_data * tdata = (thread_data*)arg ;

    uv_loop_init(tdata->loop) ;

    // 执行文件
    if(tdata->by_path) {
        node::Start(tdata->loop, tdata->args, tdata->exec_args, &tdata->isolate, nullptr) ;
    }

    // 执行函数
    else {

        // // nodejs 要求 argv 数组在连续的内存上
        // char * execargvdata = new char[3+tdata->script.length()] ;
        // strcpy(execargvdata, "-e") ;
        // strcpy(execargvdata+3, tdata->script.data()) ;
        // const char * exec_argv[2] = {execargvdata, execargvdata+3} ;
        // const char * argv[2] = {"node", "/dev/null"} ;

        // node::Start(tdata->loop, 1, argv, 2, exec_argv, &tdata->isolate, [](int argc, const char* const* argv, int exec_argc, const char* const* exec_argv,v8::Isolate * isolate){
        //     if(exec_argc>=2) {
        //         v8::Locker locker(isolate) ;
        //         v8::HandleScope scope(isolate);
        //         v8::Script::Compile ( v8::String::NewFromUtf8(isolate, exec_argv[1]) )->Run() ;
        //     }
        // }) ;

        // delete[] execargvdata ;
    }

    uv_loop_close(tdata->loop);
    delete tdata->loop;

    std::vector<thread_data*>::iterator it = FindThreadPos(tdata->thread) ;
    gThreadPool.erase(it) ;
    delete tdata ;
}

void Run(const FunctionCallbackInfo<Value>& args) {
    
    thread_data * tdata = create_thread_data(new uv_loop_t) ;
    gThreadPool.push_back(tdata);

    if( args.Length()>=1 && args[0]->IsString() ){
        tdata->args.push_back( *(v8::String::Utf8Value(args[0]->ToString())) ) ;

        if( args.Length()>=2 && args[1]->IsString() ){
            tdata->args.push_back( *(v8::String::Utf8Value(args[1]->ToString())) ) ;
        }
    }
    else {
        return ;
    }

    if( args.Length()>=3 && args[2]->IsBoolean() && !args[2]->ToBoolean()->Value() ){
        tdata->by_path = true ;
    }
    else {
        tdata->by_path = false ;
    }

    // 启动线程结束
    uv_thread_create(&tdata->thread, newthread, (void*)tdata);

    args.GetReturnValue().Set(tdata->id);
}

void HasNativeModuleLoaded(const FunctionCallbackInfo<Value>& args) {
    if( args.Length()<1 || !args[0]->IsString()){
        std::cerr << "bad argv" << std::endl ;
        return ;
    }
    v8::String::Utf8Value strModuleName(args[0]->ToString()) ;
    char * moduleName = *(strModuleName) ;

    node_module* nm = node::get_addon_module(moduleName) ;

    args.GetReturnValue().Set(nm!=nullptr) ;
}

void InitNativeModule(const FunctionCallbackInfo<Value>& args) {
    if( args.Length()<2 || !args[0]->IsString() || !args[1]->IsObject()){
        std::cerr << "bad argv" << std::endl ;
        return ;
    }

    v8::String::Utf8Value strModuleName(args[0]->ToString()) ;
    char * moduleName = *(strModuleName) ;

    node_module* nm = node::get_addon_module(moduleName) ;
    if(nm==nullptr) {
        std::cout << "unknow module name: " << moduleName << std::endl ;
        return ;
    }

    Environment* env = Environment::GetCurrent(args);
    auto context = env->context();

    Local<Object> module;
    Local<Object> exports;
    Local<Value> exports_v;
    if (!args[1]->ToObject(context).ToLocal(&module)
        || !module->Get(context, env->exports_string()).ToLocal(&exports_v)
        || !exports_v->ToObject(context).ToLocal(&exports) ) {
      return;
    }

    nm->nm_register_func ( exports, module, nm->nm_priv ) ;

    args.GetReturnValue().Set(exports) ;
}

void CurrentThreadId(const FunctionCallbackInfo<Value>& args) {
    uv_thread_t thread = uv_thread_self() ;

    thread_data * tdata = FindThread(thread) ;
    if( tdata==nullptr ) {
        args.GetReturnValue().Set(-1);
        return ;
    }

    args.GetReturnValue().Set(tdata->id);
}

void IsRunning(const FunctionCallbackInfo<Value>& args) {
    if( args.Length()<1 || !args[0]->IsInt32() ){
        std::cerr << "bad argv" << std::endl ;
        return ;
    }

    unsigned int id = args[0]->IntegerValue() ;
    bool running = FindThread(id)!=nullptr ;
    args.GetReturnValue().Set(v8::Boolean::New(args.GetIsolate(), running)) ;
}

void SendMessage(const FunctionCallbackInfo<Value>& args) {
    if( args.Length()<2 ){
        std::cerr << "buildin.sendMessage()'s arguments number must more than 2" << std::endl ;
        return ;
    }
    if( !args[0]->IsInt32() ) {
        std::cerr << "buildin.sendMessage()'s first argument must be a int" << std::endl ;
        return ;
    }
    unsigned int id = args[0]->IntegerValue() ;
    thread_data * tdata = FindThread(id) ;
    if( tdata==nullptr ) {
        std::cerr << "thread(id:"<<id<<") doesn't exists." << std::endl ;
        return ;
    }

    if( !args[1]->IsString() ) {
        std::cerr << "buildin.sendMessage()'s second argument must be a string" << std::endl ;
        return ;
    }
    std::string msg = std::string(*v8::String::Utf8Value(args[1]->ToString())) ;


    // 消息优先级
    int priority = 3 ;
    if( args.Length()>=3 && args[2]->IsInt32() ){
        priority = args[2]->ToInt32(args.GetIsolate())->Value() ;
    }
    if(priority<0 || priority>5) {
        std::cerr << "bad priority(0 >= priority <=5)" << std::endl ;
        return ;
    }

    bool suc = false ;

    // 锁定消息队列
    uv_mutex_lock(&tdata->message_mutex) ;

    // 长度超出，弹回消息
    if( tdata->max_message_length<0 || tdata->messageQueues[priority].size()<tdata->max_message_length ){

        // 插入消息队列
        tdata->messageQueues[priority].push_back(msg);

//        // 唤醒目标线程
//        if(tdata->message_async.data != nullptr)
//            uv_async_send(&tdata->message_async) ;
//        else
//            out "tdata->message_async.data == nullptr" nl

        suc = true ;
    }

    // 解锁
    uv_mutex_unlock(&tdata->message_mutex) ;

    args.GetReturnValue().Set(v8::Boolean::New(args.GetIsolate(), suc)) ;

}


void PopMessage(const FunctionCallbackInfo<Value>& args) {
    thread_data * tdata = FindThread(uv_thread_self()) ;

    // 锁定消息队列
    uv_mutex_lock(&tdata->message_mutex) ;

    for(int priority=5; priority>=0; priority--) {  // 优先级由高到低

        if( tdata->messageQueues[priority].size() ) {
            args.GetReturnValue().Set( v8::String::NewFromUtf8(args.GetIsolate(), tdata->messageQueues[priority][0].c_str()) ) ;
            tdata->messageQueues[priority].erase(tdata->messageQueues[priority].begin()) ;
            break ;
        }

    }

    // 解锁
    uv_mutex_unlock(&tdata->message_mutex) ;
}

void InitMessageAsync(const FunctionCallbackInfo<Value>& args) {

    thread_data * tdata = FindThread(uv_thread_self()) ;
    assert(tdata) ;

//    uv_async_init(tdata->loop, &tdata->message_async, async_message_awake) ;
//    tdata->message_async.data = args.GetIsolate() ;
}

void USleep(const FunctionCallbackInfo<Value>& args) {
    if( args.Length()>=1 && args[0]->IsInt32() ){
        usleep( args[0]->ToInt32(args.GetIsolate())->Value() ) ;
    }
}
void MSleep(const FunctionCallbackInfo<Value>& args) {
    if( args.Length()>=1 && args[0]->IsInt32() ){
        usleep( args[0]->ToInt32(args.GetIsolate())->Value() * 1000 ) ;
    }
}
void Sleep(const FunctionCallbackInfo<Value>& args) {
    if( args.Length()>=1 && args[0]->IsInt32() ){
        sleep( args[0]->ToInt32(args.GetIsolate())->Value() ) ;
    }
}
void USec(const FunctionCallbackInfo<Value>& args) {
    timeval tv ;
    gettimeofday(&tv, nullptr) ;
    args.GetReturnValue().Set( v8::Int32::New(args.GetIsolate(), tv.tv_usec)) ;
}

void Initialize(Local<Object> target,
                Local<Value> unused,
                Local<Context> context) {
    Environment* env = Environment::GetCurrent(context);
    env->SetMethod(target, "run", Run);
    env->SetMethod(target, "currentThreadId", CurrentThreadId);
    env->SetMethod(target, "isRunning", IsRunning);
    env->SetMethod(target, "initNativeModule", InitNativeModule);
    env->SetMethod(target, "hasNativeModuleLoaded", HasNativeModuleLoaded);
    env->SetMethod(target, "sendMessage", SendMessage);
    env->SetMethod(target, "popMessage", PopMessage);
    env->SetMethod(target, "initMessageAsync", InitMessageAsync);
    env->SetMethod(target, "usleep", USleep);
    env->SetMethod(target, "msleep", MSleep);
    env->SetMethod(target, "sleep", Sleep);
    env->SetMethod(target, "usec", USec);


    // hook v8::Isolate::GetCurrent() 函数
    if( v8::hookedGetterCurrentIsolate()==nullptr ) {
        v8::hookGetterCurrentIsolate(CurrentIsolate) ;
    }

    // 为主线程创建一个 thread_data 对象
    if( FindThread(uv_thread_self())==nullptr ) {
        thread_data * tdata = create_thread_data(uv_default_loop());
        tdata->thread = uv_thread_self() ;
        tdata->isolate = env->isolate() ;

        gThreadPool.push_back(tdata);
    }
}

}  // namespace Thread
}  // namespace node

NODE_BUILTIN_MODULE_CONTEXT_AWARE(thread, node::Thread::Initialize) ;
