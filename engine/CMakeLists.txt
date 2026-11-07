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
    src/claim.cpp
    src/defender.cpp
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
        # Full DDS table searches exceed Emscripten's default 64 KiB stack.
        # Keep overflow checks enabled so a future limit fails explicitly.
        "-sSTACK_SIZE=5242880"
        "-sSTACK_OVERFLOW_CHECK=2"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sNO_EXIT_RUNTIME=1"
    )
    set_target_properties(bridge_wasm PROPERTIES
        OUTPUT_NAME bridge_engine
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${BRIDGE_WASM_OUTPUT_DIR}"
    )
else()
    # Opt-in native research tooling; the production/WASM engine is unchanged.
    add_library(bridge_plan_tree src/plan_tree.cpp src/plan_dag.cpp
        src/plan_evaluate.cpp src/plan_challenge.cpp src/plan_edit.cpp src/plan_repair.cpp
        src/plan_proof.cpp src/plan_deep.cpp)
    target_link_libraries(bridge_plan_tree PUBLIC bridge_engine)

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

    add_executable(bridge_alpha_mu_lab
        src/alpha_mu_lab.cpp
        src/plan_refinement_lab.cpp
        src/plan_deep_lab.cpp
    )

    target_link_libraries(bridge_alpha_mu_lab PRIVATE bridge_engine bridge_plan_tree)
    if (WIN32)
        target_link_libraries(bridge_alpha_mu_lab PRIVATE psapi)
    endif()

    add_executable(bridge_plan_tree_tests tests/plan_tree_tests.cpp)
    target_link_libraries(bridge_plan_tree_tests PRIVATE bridge_plan_tree)
    add_test(NAME bridge_plan_tree_tests COMMAND bridge_plan_tree_tests)
    add_test(NAME bridge_plan_tree_corpus_smoke COMMAND bridge_alpha_mu_lab
        plan-trees ${CMAKE_CURRENT_SOURCE_DIR}/tests/data/alpha_mu_corpus.tsv 3 10)
    add_executable(bridge_plan_dag_tests tests/plan_dag_tests.cpp)
    target_link_libraries(bridge_plan_dag_tests PRIVATE bridge_plan_tree)
    add_test(NAME bridge_plan_dag_tests COMMAND bridge_plan_dag_tests)
    add_test(NAME bridge_plan_dag_corpus_smoke COMMAND bridge_alpha_mu_lab
        plan-dags ${CMAKE_CURRENT_SOURCE_DIR}/tests/data/alpha_mu_corpus.tsv 3 10)
    add_executable(bridge_plan_challenge_tests tests/plan_challenge_tests.cpp)
    target_link_libraries(bridge_plan_challenge_tests PRIVATE bridge_plan_tree)
    add_test(NAME bridge_plan_challenge_tests COMMAND bridge_plan_challenge_tests)
    add_test(NAME bridge_plan_refinement_smoke COMMAND bridge_alpha_mu_lab
        plan-refine-6s 4 42 1 32 10)
    add_executable(bridge_plan_repair_tests tests/plan_repair_tests.cpp)
    target_link_libraries(bridge_plan_repair_tests PRIVATE bridge_plan_tree)
    add_test(NAME bridge_plan_repair_tests COMMAND bridge_plan_repair_tests)
    add_test(NAME bridge_plan_persistent_smoke COMMAND bridge_alpha_mu_lab
        plan-persist-6s 2 42 1 16 10)
    add_executable(bridge_plan_proof_storage_tests tests/plan_proof_storage_tests.cpp)
    target_link_libraries(bridge_plan_proof_storage_tests PRIVATE bridge_plan_tree)
    add_test(NAME bridge_plan_proof_storage_tests COMMAND bridge_plan_proof_storage_tests)
    add_executable(bridge_plan_deep_tests tests/plan_deep_tests.cpp)
    target_link_libraries(bridge_plan_deep_tests PRIVATE bridge_plan_tree)
    add_test(NAME bridge_plan_deep_tests COMMAND bridge_plan_deep_tests)
    add_test(NAME bridge_plan_deep_smoke COMMAND bridge_alpha_mu_lab
        plan-deep-6s 2 26 3 42)

    add_test(
        NAME bridge_engine_tests
        COMMAND bridge_engine_tests
    )

    add_test(
        NAME bridge_alpha_mu_corpus
        COMMAND bridge_alpha_mu_lab corpus
            ${CMAKE_CURRENT_SOURCE_DIR}/tests/data/alpha_mu_corpus.tsv
    )

    add_test(
        NAME bridge_alpha_mu_collision_miner
        COMMAND bridge_alpha_mu_lab mine
    )

    add_test(
        NAME bridge_alpha_mu_paired
        COMMAND bridge_alpha_mu_lab paired 20 11565831
    )

    add_test(
        NAME bridge_alpha_mu_bridgemaster_smoke
        COMMAND bridge_alpha_mu_lab bridgemaster6s 64 2 10 11565831 64
    )
endif()
