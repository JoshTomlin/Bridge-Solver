cmake_minimum_required(VERSION 3.20)
project(BridgeSolverEngine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(CTest)

set(DDS_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../external/dds)

add_library(dds STATIC
    ${DDS_ROOT}/src/ABsearch.cpp
    ${DDS_ROOT}/src/ABstats.cpp
    ${DDS_ROOT}/src/CalcTables.cpp
    ${DDS_ROOT}/src/dds.cpp
    ${DDS_ROOT}/src/DealerPar.cpp
    ${DDS_ROOT}/src/dump.cpp
    ${DDS_ROOT}/src/File.cpp
    ${DDS_ROOT}/src/Init.cpp
    ${DDS_ROOT}/src/LaterTricks.cpp
    ${DDS_ROOT}/src/Memory.cpp
    ${DDS_ROOT}/src/Moves.cpp
    ${DDS_ROOT}/src/Par.cpp
    ${DDS_ROOT}/src/PBN.cpp
    ${DDS_ROOT}/src/PlayAnalyser.cpp
    ${DDS_ROOT}/src/QuickTricks.cpp
    ${DDS_ROOT}/src/Scheduler.cpp
    ${DDS_ROOT}/src/SolveBoard.cpp
    ${DDS_ROOT}/src/SolverIF.cpp
    ${DDS_ROOT}/src/System.cpp
    ${DDS_ROOT}/src/ThreadMgr.cpp
    ${DDS_ROOT}/src/Timer.cpp
    ${DDS_ROOT}/src/TimerGroup.cpp
    ${DDS_ROOT}/src/TimerList.cpp
    ${DDS_ROOT}/src/TimeStat.cpp
    ${DDS_ROOT}/src/TimeStatList.cpp
    ${DDS_ROOT}/src/TransTableL.cpp
    ${DDS_ROOT}/src/TransTableS.cpp
)

target_include_directories(dds
    PUBLIC
        ${DDS_ROOT}/include
)

target_compile_features(dds PUBLIC cxx_std_20)

if (WIN32)
    target_compile_definitions(dds PRIVATE DDS_THREADS_WINAPI)
endif()

if (EMSCRIPTEN)
    # DDS has no WebAssembly hardware branch. Reuse its sysconf-based probe for
    # System.cpp only so SetMaxThreads creates one single-threaded solver.
    set_source_files_properties(${DDS_ROOT}/src/System.cpp PROPERTIES
        COMPILE_DEFINITIONS "__linux;__linux__"
    )
endif()

add_library(bridge_engine
    src/analysis_session.cpp
    src/alpha_mu.cpp
    src/alpha_mu2.cpp
    src/alpha_mu_pareto.cpp
    src/alpha_mu_policy.cpp
    src/alpha_mu_state.cpp
    src/card.cpp
    src/dds_solver.cpp
    src/engine.cpp
    src/game.cpp
    src/quick_tricks.cpp
)

target_include_directories(bridge_engine
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(bridge_engine PUBLIC cxx_std_20)
target_link_libraries(bridge_engine PUBLIC dds)

if (EMSCRIPTEN)
    set(BRIDGE_WASM_OUTPUT_DIR "${CMAKE_BINARY_DIR}/wasm" CACHE PATH
        "Output directory for browser engine artifacts")

    target_compile_options(bridge_engine PRIVATE -fexceptions)

    add_executable(bridge_wasm src/wasm_bindings.cpp)
    target_link_libraries(bridge_wasm PRIVATE bridge_engine)
    target_compile_options(bridge_wasm PRIVATE -O3 -fexceptions)
    target_link_options(bridge_wasm PRIVATE
        --bind
        -O3
        -fexceptions
        "-sDISABLE_EXCEPTION_CATCHING=0"
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sEXPORT_NAME=createBridgeEngine"
        "-sENVIRONMENT=web,worker,node"
        "-sINITIAL_MEMORY=67108864"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sNO_EXIT_RUNTIME=1"
    )
    set_target_properties(bridge_wasm PROPERTIES
        OUTPUT_NAME bridge_engine
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${BRIDGE_WASM_OUTPUT_DIR}"
    )
else()
    add_executable(bridge_engine_cli
        src/interactive_cli.cpp
        src/main.cpp
        src/playthrough_demo.cpp
    )

    target_link_libraries(bridge_engine_cli PRIVATE bridge_engine)

    add_executable(bridge_engine_tests
        tests/engine_tests.cpp
    )

    target_link_libraries(bridge_engine_tests PRIVATE bridge_engine)

    add_executable(bridge_alpha_mu2_report
        src/alpha_mu2_report.cpp
    )

    target_link_libraries(bridge_alpha_mu2_report PRIVATE bridge_engine)

    add_test(
        NAME bridge_engine_tests
        COMMAND bridge_engine_tests
    )
endif()
