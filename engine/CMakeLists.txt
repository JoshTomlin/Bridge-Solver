cmake_minimum_required(VERSION 3.20)
project(BridgeSolverEngine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(CTest)

add_library(bridge_engine
    src/engine.cpp
)

target_include_directories(bridge_engine
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(bridge_engine PUBLIC cxx_std_20)

add_executable(bridge_engine_cli
    src/main.cpp
)

target_link_libraries(bridge_engine_cli PRIVATE bridge_engine)

add_executable(bridge_engine_tests
    tests/engine_tests.cpp
)

target_link_libraries(bridge_engine_tests PRIVATE bridge_engine)

add_test(
    NAME bridge_engine_tests
    COMMAND bridge_engine_tests
)
