#!/bin/bash
set -e

BUILD_DIR="$(pwd)/build"
EXPORTS="_get_ffmpeg_version"
EXPORTS+=",_test_webgpu_device"
EXPORTS+=",_test_webgpu_scale_upscale"
EXPORTS+=",_test_webgpu_scale_downscale"
EXPORTS+=",_test_webgpu_scale_passthrough"
EXPORTS+=",_test_webgpu_scale_asymmetric"
EXPORTS+=",_bench_scale_webgpu"
EXPORTS+=",_bench_scale_cpu"

emcc ffmpeg_wasm.c \
    -I. \
    -I"$BUILD_DIR/include" \
    -L"$BUILD_DIR/lib" \
    -lavfilter -lavcodec -lavformat -lavutil -lswscale -lswresample \
    --use-port=emdawnwebgpu \
    -s ASYNCIFY \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="FFmpegWASM" \
    -s EXPORTED_FUNCTIONS="[$EXPORTS]" \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    -s INITIAL_MEMORY=67108864 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -O3 \
    -o ffmpeg_wasm.js

echo "Built ffmpeg_wasm.js + ffmpeg_wasm.wasm"
