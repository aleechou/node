// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

#ifndef SRC_NODE_THREAD_H_
#define SRC_NODE_THREAD_H_

#include "v8.h"
#include "node.h"

namespace node {
namespace Thread {


struct thread_data {
    unsigned int id ;
    uv_thread_t thread ;
    uv_loop_t * loop ;
    std::string script ;
    std::string script_argv ;
    bool by_path = true ;
    v8::Isolate * isolate = nullptr ;

    uv_mutex_t message_mutex;
    uv_async_t message_async;
    std::vector< std::string > messages ;
    unsigned short max_message_length = 100 ;
} ;
    

thread_data * FindThread(uv_thread_t thread) ;
thread_data * FindThread(unsigned int id) ;

v8::Isolate* CurrentIsolate() ;

}  // namespace Thread
}  // namespace node

#endif  // SRC_NODE_THREAD_H_
