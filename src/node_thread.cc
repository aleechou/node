#include "node_thread.h"
#include "env-inl.h"
#include "node_internals.h"
#include <iostream>

namespace node {

namespace Thread {

using v8::Context;
using v8::Isolate;
using v8::Local;
using v8::Value;
using v8::Object;
using v8::FunctionCallback;
using v8::FunctionCallbackInfo;


int assigned_thread_id = 0;

struct thread_data {
    int id ;
    uv_thread_t thread ;
    uv_loop_t loop ;
    std::string scriptpath ;
} ;


static void newthread(void* arg) {

    thread_data * tdata = (thread_data*)arg ;

    std::cout << "this child thread: " << tdata->scriptpath << std::endl ;

    // nodejs 要求 argv 数组在连续的内存上
    char * argvdata = new char[5+tdata->scriptpath.length()] ;
    strcpy(argvdata, "node") ;
    strcpy(argvdata+5, tdata->scriptpath.data()) ;
    char * argv[2] = {argvdata, argvdata+5} ;

    uv_loop_init(&tdata->loop) ;

    node::Start(&tdata->loop, 2, argv, 0, nullptr) ;
    std::cout<< "node thread finished. " << tdata->id << std::endl ;

    delete tdata ;
}

void Run(const FunctionCallbackInfo<Value>& args) {
    
    thread_data * tdata = new thread_data ;
    tdata->id = assigned_thread_id ++ ;

    tdata->scriptpath = "../demo/thread.js" ;
    // FF_ARG_STRING_IFDEF(0, tdata->scriptpath, "");

    // 启动线程结束
    uv_thread_create(&tdata->thread, newthread, (void*)tdata);

}

void Initialize(Local<Object> target,
                Local<Value> unused,
                Local<Context> context) {
  Environment* env = Environment::GetCurrent(context);
  env->SetMethod(target, "run", Run);

  std::cout << "node::Thread::Initialize()" << std::endl ;
}

}  // namespace Thread
}  // namespace node

NODE_BUILTIN_MODULE_CONTEXT_AWARE(thread, node::Thread::Initialize) ;