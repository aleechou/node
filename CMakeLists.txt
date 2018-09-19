cmake_minimum_required(VERSION 3.1)

set(CMAKE_BUILD_TYPE Release)

# 项目名称
project(node VERSION 10.10.0)

include_directories(deps)
include_directories(deps/uv/include)
include_directories(deps/v8/include)

# 构建动态链接库
file(GLOB_RECURSE SOURCE_FILES "src/*.cc" "src/*.h")

add_executable(${PROJECT_NAME} ${SOURCE_FILES})
