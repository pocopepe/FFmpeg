/**
 * ffmpeg-webgpu.js — thin JS wrapper around the WebGPU WASM build.
 *
 * Usage:
 *   import { createFFmpegWebGPU } from './ffmpeg-webgpu.js';
 *   const ff = await createFFmpegWebGPU();
 *   const out = await ff.runGPU(srcRgba, srcW, srcH, dstW, dstH, 'scale_webgpu=1280:720');
 *
 * Adding a new GPU filter: just pass a different filtergraph string.
 * No changes to this file or pipeline.c needed.
 */

export async function createFFmpegWebGPU(wasmPath = './build-webgpu/ffmpeg-webgpu.js') {
    const { default: factory } = await import(wasmPath);
    const mod = await factory();

    const version  = mod.ccall('pipeline_version', 'string', [], []);
    const runCPU   = mod.cwrap('pipeline_run_rgba',     'number', ['number','number','number','number','number','number','string']);
    const runGPU   = mod.cwrap('pipeline_run_rgba_gpu', 'number', ['number','number','number','number','number','number','string']);
    const benchGPU = mod.cwrap('bench_scale_webgpu',    'number', ['number','number','number','number','number']);
    const benchCPU = mod.cwrap('bench_scale_cpu',       'number', ['number','number','number','number','number']);

    function allocRgba(rgba) {
        const ptr = mod._malloc(rgba.byteLength);
        mod.HEAPU8.set(rgba, ptr);
        return ptr;
    }

    return {
        version,

        /** Run any CPU filtergraph on RGBA pixel data. */
        async runCPU(srcRgba, srcW, srcH, dstW, dstH, filtergraph) {
            const srcPtr = allocRgba(srcRgba);
            const dstPtr = mod._malloc(dstW * dstH * 4);
            const ret = runCPU(srcPtr, srcW, srcH, dstPtr, dstW, dstH, filtergraph);
            const out = ret === 0 ? new Uint8ClampedArray(mod.HEAPU8.buffer, dstPtr, dstW * dstH * 4).slice() : null;
            mod._free(srcPtr); mod._free(dstPtr);
            if (ret !== 0) throw new Error(`pipeline_run_rgba failed: ${ret}`);
            return out;
        },

        /** Run any WebGPU filtergraph on RGBA pixel data. */
        async runGPU(srcRgba, srcW, srcH, dstW, dstH, filtergraph) {
            const srcPtr = allocRgba(srcRgba);
            const dstPtr = mod._malloc(dstW * dstH * 4);
            const ret = runGPU(srcPtr, srcW, srcH, dstPtr, dstW, dstH, filtergraph);
            const out = ret === 0 ? new Uint8ClampedArray(mod.HEAPU8.buffer, dstPtr, dstW * dstH * 4).slice() : null;
            mod._free(srcPtr); mod._free(dstPtr);
            if (ret !== 0) throw new Error(`pipeline_run_rgba_gpu failed: ${ret}`);
            return out;
        },

        /** Benchmark: returns ms/frame for GPU scale. */
        benchGPU(srcW, srcH, dstW, dstH, iterations = 100) {
            return benchGPU(srcW, srcH, dstW, dstH, iterations);
        },

        /** Benchmark: returns ms/frame for CPU scale. */
        benchCPU(srcW, srcH, dstW, dstH, iterations = 100) {
            return benchCPU(srcW, srcH, dstW, dstH, iterations);
        },
    };
}
