/**
 * ffmpeg-cpu.js — thin JS wrapper around the CPU-only WASM build.
 *
 * Usage:
 *   import { createFFmpegCPU } from './ffmpeg-cpu.js';
 *   const ff = await createFFmpegCPU();
 *
 *   // run any filtergraph on raw RGBA pixels
 *   const out = await ff.run(srcRgba, srcW, srcH, dstW, dstH, 'scale=640:360');
 *
 *   // decode a video file (MP4, WebM, etc.) from a Uint8Array
 *   const decoder = ff.createDecoder(fileBytes);
 *   console.log(decoder.width, decoder.height, decoder.fps);
 *   let frame;
 *   while ((frame = decoder.nextFrame()) !== null) {
 *       // frame is Uint8ClampedArray RGBA at native resolution
 *       ctx.putImageData(new ImageData(frame, decoder.width, decoder.height), 0, 0);
 *   }
 *   decoder.close();
 */

export async function createFFmpegCPU(wasmPath = './build-cpu/ffmpeg-cpu.js') {
    const { default: factory } = await import(wasmPath);
    const mod = await factory();

    const version  = mod.ccall('pipeline_version', 'string', [], []);
    const runCPU   = mod.cwrap('pipeline_run_rgba', 'number', ['number','number','number','number','number','number','string']);
    const benchCPU = mod.cwrap('bench_scale_cpu',   'number', ['number','number','number','number','number']);

    function allocBytes(buf) {
        const ptr = mod._malloc(buf.byteLength);
        mod.HEAPU8.set(buf, ptr);
        return ptr;
    }

    return {
        version,

        /** Run any CPU filtergraph on RGBA pixel data. */
        run(srcRgba, srcW, srcH, dstW, dstH, filtergraph) {
            const srcPtr = allocBytes(srcRgba);
            const dstPtr = mod._malloc(dstW * dstH * 4);
            const ret = runCPU(srcPtr, srcW, srcH, dstPtr, dstW, dstH, filtergraph);
            const out = ret === 0
                ? new Uint8ClampedArray(mod.HEAPU8.buffer, dstPtr, dstW * dstH * 4).slice()
                : null;
            mod._free(srcPtr); mod._free(dstPtr);
            if (ret !== 0) throw new Error(`pipeline_run_rgba failed: ${ret}`);
            return out;
        },

        /**
         * Open a decode session from raw file bytes (Uint8Array).
         * Returns a decoder object with nextFrame() and close().
         */
        createDecoder(fileBytes) {
            const srcPtr = allocBytes(fileBytes);
            const handle = mod.ccall('decoder_open', 'number',
                ['number', 'number'], [srcPtr, fileBytes.byteLength]);
            mod._free(srcPtr);
            if (handle < 0) throw new Error(`decoder_open failed: ${handle}`);

            const width   = mod.ccall('decoder_width',   'number', ['number'], [handle]);
            const height  = mod.ccall('decoder_height',  'number', ['number'], [handle]);
            const fpsNum  = mod.ccall('decoder_fps_num', 'number', ['number'], [handle]);
            const fpsDen  = mod.ccall('decoder_fps_den', 'number', ['number'], [handle]);
            const fps     = fpsNum / fpsDen;

            let bufSize = width * height * 4;
            let frameBuf = mod._malloc(bufSize);

            return {
                width, height, fps,

                /**
                 * Decode the next frame.
                 * @param {number} [dstW] - output width (defaults to native)
                 * @param {number} [dstH] - output height (defaults to native)
                 * @returns {Uint8ClampedArray|null} RGBA pixels, or null at EOF
                 */
                nextFrame(dstW = width, dstH = height) {
                    const needed = dstW * dstH * 4;
                    if (needed > bufSize) {
                        mod._free(frameBuf);
                        frameBuf = mod._malloc(needed);
                        bufSize  = needed;
                    }
                    const ret = mod.ccall('decoder_next_frame', 'number',
                        ['number','number','number','number'],
                        [handle, frameBuf, dstW, dstH]);
                    if (ret === 1) return null;
                    if (ret < 0) throw new Error(`decoder_next_frame failed: ${ret}`);
                    return new Uint8ClampedArray(mod.HEAPU8.buffer, frameBuf, needed).slice();
                },

                close() {
                    mod._free(frameBuf);
                    mod.ccall('decoder_close', null, ['number'], [handle]);
                },
            };
        },

        bench(srcW, srcH, dstW, dstH, iterations = 100) {
            return benchCPU(srcW, srcH, dstW, dstH, iterations);
        },
    };
}
