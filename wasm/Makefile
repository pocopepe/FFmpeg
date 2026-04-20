SHELL := /bin/bash

CPU_BUILD    := build-cpu
WEBGPU_BUILD := build-webgpu

NPROC := $(shell sysctl -n hw.ncpu 2>/dev/null || nproc)

DECODER_EXPORTS := _decoder_open,_decoder_width,_decoder_height,_decoder_fps_num,_decoder_fps_den,_decoder_next_frame,_decoder_close
CPU_EXPORTS    := _malloc,_free,_pipeline_version,_pipeline_run_rgba,_bench_scale_cpu,$(DECODER_EXPORTS)
WEBGPU_EXPORTS := _malloc,_free,_pipeline_version,_pipeline_run_rgba,_pipeline_run_rgba_gpu,_bench_scale_cpu,_bench_scale_webgpu,$(DECODER_EXPORTS)

.PHONY: all cpu webgpu configure-cpu configure-webgpu clean size test test-fate bench

all: cpu webgpu

# ── CPU build ────────────────────────────────────────────────────────────────

configure-cpu:
	cd .. && bash wasm/configure-cpu.sh && emmake make -j$(NPROC) install

cpu: $(CPU_BUILD)/ffmpeg-cpu.js

$(CPU_BUILD)/lib/libavcodec.a:
	$(MAKE) configure-cpu

$(CPU_BUILD)/ffmpeg-cpu.js: pipeline.c $(CPU_BUILD)/lib/libavcodec.a
	emcc pipeline.c \
	    -I.. \
	    -I$(CPU_BUILD)/include \
	    -L$(CPU_BUILD)/lib \
	    -lavfilter -lavcodec -lavformat -lavutil -lswscale -lswresample \
	    -s WASM=1 \
	    -s MODULARIZE=1 \
	    -s EXPORT_NAME="FFmpegCPU" \
	    -s EXPORTED_FUNCTIONS="[$(CPU_EXPORTS)]" \
	    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8"]' \
	    -s INITIAL_MEMORY=67108864 \
	    -s ALLOW_MEMORY_GROWTH=1 \
	    -O3 \
	    -o $(CPU_BUILD)/ffmpeg-cpu.js

# ── WebGPU build ──────────────────────────────────────────────────────────────

configure-webgpu:
	cd .. && bash wasm/configure-webgpu.sh && emmake make -j$(NPROC) install

webgpu: $(WEBGPU_BUILD)/ffmpeg-webgpu.js

$(WEBGPU_BUILD)/lib/libavcodec.a:
	$(MAKE) configure-webgpu

$(WEBGPU_BUILD)/ffmpeg-webgpu.js: pipeline.c $(WEBGPU_BUILD)/lib/libavcodec.a
	emcc pipeline.c \
	    -I.. \
	    -I$(WEBGPU_BUILD)/include \
	    -L$(WEBGPU_BUILD)/lib \
	    -lavfilter -lavcodec -lavformat -lavutil -lswscale -lswresample \
	    --use-port=emdawnwebgpu \
	    -s WASM=1 \
	    -s ASYNCIFY \
	    -s MODULARIZE=1 \
	    -s EXPORT_NAME="FFmpegWebGPU" \
	    -s EXPORTED_FUNCTIONS="[$(WEBGPU_EXPORTS)]" \
	    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8"]' \
	    -s INITIAL_MEMORY=67108864 \
	    -s ALLOW_MEMORY_GROWTH=1 \
	    -DCONFIG_WEBGPU \
	    -O3 \
	    -o $(WEBGPU_BUILD)/ffmpeg-webgpu.js

# ── size report (live, no hardcoded values) ───────────────────────────────────

size:
	@bash tests/size.sh

# ── test suite ────────────────────────────────────────────────────────────────

test:
	node tests/test.mjs

test-fate:
	node tests/fate.mjs

# ── benchmark ─────────────────────────────────────────────────────────────────

bench:
	@echo "Open wasm/tests/bench.html in Chrome with WebGPU enabled."
	@echo "Or: npx serve .. then go to /wasm/tests/bench.html"

clean:
	rm -rf $(CPU_BUILD) $(WEBGPU_BUILD)
