#!/bin/bash

FFMPEG_FLAGS=(
    --target-os=none
    --arch=x86_32
    --enable-cross-compile
    --disable-x86asm
    --disable-inline-asm
    --disable-stripping
    --disable-programs
    --disable-doc
    --disable-debug
    --disable-runtime-cpudetect
    --disable-autodetect
    --enable-small
    --disable-pthreads
)

FFMPEG_FLAGS+=(
    --disable-network
    --disable-everything

    --enable-avcodec
    --enable-avformat
    --enable-avfilter
    --enable-avutil
    --enable-swscale
    --enable-swresample

    --enable-filter=buffer
    --enable-filter=buffersink
    --enable-filter=scale_webgpu

    --enable-decoder=h264
    --enable-decoder=aac
    --enable-decoder=mp3
    --enable-demuxer=mov
    --enable-demuxer=mp4
    --enable-demuxer=mp3
    --enable-parser=h264
    --enable-parser=aac

    --enable-webgpu
    --enable-filter=scale_webgpu
)

emconfigure ./configure \
    "${FFMPEG_FLAGS[@]}" \
    --prefix=$(pwd)/build \
    --cc="emcc" \
    --cxx="em++" \
    --ar="emar" \
    --ranlib="emranlib" \
    --disable-shared \
    --enable-static \
    --extra-cflags="-O3 --use-port=emdawnwebgpu" \
    --extra-cxxflags="-O3" \
    --extra-ldflags="-O3 --use-port=emdawnwebgpu -s ASYNCIFY -s INITIAL_MEMORY=33554432"
