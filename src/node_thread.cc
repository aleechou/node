#include "node_thread.h"
#include "env-inl.h"
#include "node_internals.h"
#include <iostream>
#include <unordered_map>

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

std::vector<thread_data*> gThreadPool ;

std::vector<thread_data*>::iterator FindThread(uv_thread_t thread) {
    for(std::vector<thread_data*>::iterator it=gThreadPool.begin();
            it!=gThreadPool.end(); it++)
    {
        if(uv_thread_equal(&(*it)->thread, &thread)) {
            return it ;
        }
    }
    return gThreadPool.end() ;
}

static void newthread(void* arg) {

    thread_data * tdata = (thread_data*)arg ;

    std::cout << "this child thread: " << tdata->scriptpath << std::endl ;

    // nodejs 要求 argv 数组在连续的内存上
    char * argvdata = new char[5+3+tdata->scriptpath.length()] ;
    strcpy(argvdata, "node") ;
    strcpy(argvdata, "-e") ;
    strcpy(argvdata+5, tdata->scriptpath.data()) ;
    char * argv[2] = {argvdata, argvdata+5} ;

    uv_loop_init(&tdata->loop) ;

    node::Start(&tdata->loop, 2, argv, 0, nullptr) ;
    std::cout<< "node thread finished. " << tdata->id << std::endl ;

    std::vector<thread_data*>::iterator it = FindThread(tdata->thread) ;
    gThreadPool.erase(it) ;
    delete tdata ;
}

void Run(const FunctionCallbackInfo<Value>& args) {
    
    thread_data * tdata = new thread_data ;
    tdata->id = assigned_thread_id ++ ;

    gThreadPool.push_back(tdata);

    tdata->scriptpath = "../demo/thread.js" ;
    // FF_ARG_STRING_IFDEF(0, tdata->scriptpath, "");

    // 启动线程结束
    uv_thread_create(&tdata->thread, newthread, (void*)tdata);

    args.GetReturnValue().Set(tdata->id);
}

void CurrentThreadId(const FunctionCallbackInfo<Value>& args) {
    uv_thread_t thread = uv_thread_self() ;

    std::vector<thread_data*>::iterator it = FindThread(thread) ;
    if( it==gThreadPool.end() ) {
        return ;
    }

    args.GetReturnValue().Set((*it)->id);
}

void Initialize(Local<Object> target,
                Local<Value> unused,
                Local<Context> context) {
  Environment* env = Environment::GetCurrent(context);
  env->SetMethod(target, "run", Run);
  env->SetMethod(target, "currentThreadId", CurrentThreadId);

  std::cout << "node::Thread::Initialize()" << std::endl ;
}

}  // namespace Thread
}  // namespace node

NODE_BUILTIN_MODULE_CONTEXT_AWARE(thread, node::Thread::Initialize) ;