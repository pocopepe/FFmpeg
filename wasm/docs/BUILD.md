# Building ffmpeg-webgpu

ffmpeg-webgpu compiles FFmpeg to WebAssembly with optional WebGPU GPU acceleration.
New GPU filters slot into the pipeline via filtergraph strings — no C changes needed.

## Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (`emcc` in PATH)
- Node.js >= 18
- Python 3 (for configure)

## Quick start

```bash
# interactive — picks codecs, target, asks if you want to build now
node wasm/cli/configure.mjs

# non-interactive
node wasm/cli/configure.mjs --preset=minimal --target=both --build
```

Presets:

| preset   | codecs                                          |
|----------|-------------------------------------------------|
| minimal  | H264/VP8 decode, AAC/MJPEG/PNG encode, ~10 filters |
| standard | adds HEVC/VP9/AV1/Opus decode, more filters    |

## Manual build

```bash
# configure + compile FFmpeg libs
make -C wasm configure-cpu        # CPU only
make -C wasm configure-webgpu     # WebGPU

# link pipeline.c against compiled libs
make -C wasm cpu
make -C wasm webgpu

# or both at once
make -C wasm all
```

## Output

| file                            | description                    |
|---------------------------------|--------------------------------|
| `wasm/build-cpu/ffmpeg-cpu.js`      | CPU-only WASM module           |
| `wasm/build-cpu/ffmpeg-cpu.wasm`    | CPU-only WASM binary           |
| `wasm/build-webgpu/ffmpeg-webgpu.js`   | WebGPU WASM module             |
| `wasm/build-webgpu/ffmpeg-webgpu.wasm` | WebGPU WASM binary             |

## Using the JS API

```js
import { createFFmpegWebGPU } from './wasm/js/ffmpeg-webgpu.js';

const ff = await createFFmpegWebGPU();

// run any CPU filter
const out = await ff.runCPU(rgbaPixels, srcW, srcH, dstW, dstH, 'scale=1280:720');

// run any GPU filter (WebGPU build only)
const out = await ff.runGPU(rgbaPixels, srcW, srcH, dstW, dstH, 'scale_webgpu=1280:720');
```

Input/output: raw `Uint8ClampedArray` RGBA pixels — drop straight into `ImageData`.

## Adding a new GPU filter

1. Write the filter in `libavfilter/vf_yourfilter_webgpu.c`
2. Register it in `libavfilter/allfilters.c` and `libavfilter/Makefile`
3. Add `--enable-filter=yourfilter_webgpu` to `wasm/configure-webgpu.sh` (or re-run the CLI)
4. Rebuild: `make -C wasm configure-webgpu && make -C wasm webgpu`
5. Use it: `ff.runGPU(pixels, w, h, dw, dh, 'yourfilter_webgpu=...')`

That's it. No changes to `pipeline.c` or the JS wrappers.

## Running tests

```bash
# unit tests (synthetic frames)
make -C wasm test

# integration tests with real FFmpeg FATE samples
make -C wasm test-fate
```

## Size

After building, compare against ffmpeg.wasm:

```bash
make -C wasm size   # internal, not shipped
```
