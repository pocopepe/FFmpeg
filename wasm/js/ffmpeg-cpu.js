/**
 * ffmpeg-cpu.js — thin JS wrapper around the CPU-only WASM build.
 *
 * Usage:
 *   import { createFFmpegCPU } from './ffmpeg-cpu.js';
 *   const ff = await createFFmpegCPU();
 *   const out = await ff.run(srcRgba, srcW, srcH, dstW, dstH, 'scale=640:360');
 */

export async function createFFmpegCPU(wasmPath = './build-cpu/ffmpeg-cpu.js') {
    const { default: factory } = await import(wasmPath);
    const mod = await factory();

    const version  = mod.ccall('pipeline_version', 'string', [], []);
    const runCPU   = mod.cwrap('pipeline_run_rgba', 'number', ['number','number','number','number','number','number','string']);
    const benchCPU = mod.cwrap('bench_scale_cpu',   'number', ['number','number','number','number','number']);

    function allocRgba(rgba) {
        const ptr = mod._malloc(rgba.byteLength);
        mod.HEAPU8.set(rgba, ptr);
        return ptr;
    }

    return {
        version,

        /** Run any CPU filtergraph on RGBA pixel data. */
        async run(srcRgba, srcW, srcH, dstW, dstH, filtergraph) {
            const srcPtr = allocRgba(srcRgba);
            const dstPtr = mod._malloc(dstW * dstH * 4);
            const ret = runCPU(srcPtr, srcW, srcH, dstPtr, dstW, dstH, filtergraph);
            const out = ret === 0 ? new Uint8ClampedArray(mod.HEAPU8.buffer, dstPtr, dstW * dstH * 4).slice() : null;
            mod._free(srcPtr); mod._free(dstPtr);
            if (ret !== 0) throw new Error(`pipeline_run_rgba failed: ${ret}`);
            return out;
        },

        benchCPU(srcW, srcH, dstW, dstH, iterations = 100) {
            return benchCPU(srcW, srcH, dstW, dstH, iterations);
        },
    };
}
