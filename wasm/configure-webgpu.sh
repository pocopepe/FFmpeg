#!/bin/bash
set -e

# WebGPU build — same as CPU build plus WebGPU hwcontext and scale_webgpu filter

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
    --disable-network
    --disable-everything

    --enable-avcodec
    --enable-avformat
    --enable-avfilter
    --enable-avutil
    --enable-swscale
    --enable-swresample

    # decoders
    --enable-decoder=h264
    --enable-decoder=vp8
    --enable-decoder=aac
    --enable-decoder=opus
    --enable-decoder=mp3
    --enable-decoder=png
    --enable-decoder=mjpeg

    # encoders (native, no external libs)
    --enable-encoder=aac
    --enable-encoder=mjpeg
    --enable-encoder=png

    # demuxers
    --enable-demuxer=mov
    --enable-demuxer=mp4
    --enable-demuxer=matroska
    --enable-demuxer=ogg
    --enable-demuxer=mp3
    --enable-demuxer=image2

    # muxers
    --enable-muxer=mp4
    --enable-muxer=webm
    --enable-muxer=ogg
    --enable-muxer=image2
    --enable-muxer=null

    # parsers
    --enable-parser=h264
    --enable-parser=vp8
    --enable-parser=aac
    --enable-parser=opus

    # filters — CPU baseline
    --enable-filter=buffer
    --enable-filter=buffersink
    --enable-filter=scale
    --enable-filter=crop
    --enable-filter=overlay
    --enable-filter=aresample
    --enable-filter=hstack
    --enable-filter=vstack
    --enable-filter=format

    # WebGPU — add new GPU filters here as they're implemented
    --enable-webgpu
    --enable-filter=scale_webgpu
)

emconfigure ./configure \
    "${FFMPEG_FLAGS[@]}" \
    --prefix="$(pwd)/wasm/build-webgpu" \
    --cc="emcc" \
    --cxx="em++" \
    --ar="emar" \
    --ranlib="emranlib" \
    --disable-shared \
    --enable-static \
    --extra-cflags="-O3 --use-port=emdawnwebgpu" \
    --extra-cxxflags="-O3" \
    --extra-ldflags="-O3 --use-port=emdawnwebgpu -s ASYNCIFY -s INITIAL_MEMORY=67108864"
