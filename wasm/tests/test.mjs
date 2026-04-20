/**
 * test.mjs — functional test suite for both CPU and WebGPU WASM builds.
 *
 * Run: node wasm/tests/test.mjs
 * Requires Node >= 18.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmDir   = path.join(__dirname, '..');
const require   = createRequire(import.meta.url);

let passed = 0, failed = 0, skipped = 0;

function ok(label, cond) {
    if (cond) { console.log(`  PASS  ${label}`); passed++; }
    else       { console.error(`  FAIL  ${label}`); failed++; }
}

function skip(label, reason) {
    console.log(`  SKIP  ${label}  (${reason})`); skipped++;
}

function makeGradient(w, h) {
    const buf = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            buf[i]   = (x * 255 / (w - 1)) | 0;
            buf[i+1] = (y * 255 / (h - 1)) | 0;
            buf[i+2] = 128;
            buf[i+3] = 255;
        }
    return buf;
}

function hasNonZero(buf) {
    return buf.some(v => v !== 0);
}

async function testBuild(name, jsPath) {
    console.log(`\n── ${name} ──`);

    if (!fs.existsSync(jsPath)) {
        console.error(`  SKIP  ${jsPath} not found`);
        return;
    }

    const factory = require(jsPath);
    let mod;
    try { mod = await factory(); }
    catch (e) { console.error(`  FAIL  load: ${e.message}`); failed++; return; }

    // version
    const ver = mod.ccall('pipeline_version', 'string', [], []);
    ok(`pipeline_version returns string`, typeof ver === 'string' && ver.length > 0);
    console.log(`        version: ${ver}`);

    const SRC_W = 320, SRC_H = 240, DST_W = 160, DST_H = 120;
    const src = makeGradient(SRC_W, SRC_H);

    // alloc helpers
    const allocU8 = buf => {
        const ptr = mod._malloc(buf.byteLength);
        mod.HEAPU8.set(buf, ptr);
        return ptr;
    };

    // CPU scale test
    {
        const srcPtr = allocU8(src);
        const dstPtr = mod._malloc(DST_W * DST_H * 4);
        const ret = mod.ccall('pipeline_run_rgba', 'number',
            ['number','number','number','number','number','number','string'],
            [srcPtr, SRC_W, SRC_H, dstPtr, DST_W, DST_H, `scale=${DST_W}:${DST_H}`]);
        const out = new Uint8Array(mod.HEAPU8.buffer, dstPtr, DST_W * DST_H * 4);
        ok(`pipeline_run_rgba returns 0`,   ret === 0);
        ok(`pipeline_run_rgba output non-zero`, hasNonZero(out));
        mod._free(srcPtr); mod._free(dstPtr);
    }

    // GPU scale test (WebGPU build only — skipped in Node, needs browser)
    if (mod._pipeline_run_rgba_gpu) {
        const srcPtr = allocU8(src);
        const dstPtr = mod._malloc(DST_W * DST_H * 4);
        const ret = mod.ccall('pipeline_run_rgba_gpu', 'number',
            ['number','number','number','number','number','number','string'],
            [srcPtr, SRC_W, SRC_H, dstPtr, DST_W, DST_H, `scale_webgpu=${DST_W}:${DST_H}`]);
        if (ret === 0) {
            const out = new Uint8Array(mod.HEAPU8.buffer, dstPtr, DST_W * DST_H * 4);
            ok(`pipeline_run_rgba_gpu returns 0`,       true);
            ok(`pipeline_run_rgba_gpu output non-zero`, hasNonZero(out));
        } else {
            skip(`pipeline_run_rgba_gpu`, 'no WebGPU adapter in Node — test in browser');
        }
        mod._free(srcPtr); mod._free(dstPtr);
    }

    // CPU bench
    {
        const ms = mod.ccall('bench_scale_cpu', 'number',
            ['number','number','number','number','number'],
            [SRC_W, SRC_H, DST_W, DST_H, 20]);
        ok(`bench_scale_cpu returns positive`, ms > 0);
        console.log(`        CPU scale: ${ms.toFixed(2)} ms/frame`);
    }

    // GPU bench (WebGPU build only)
    if (mod._bench_scale_webgpu) {
        const ms = mod.ccall('bench_scale_webgpu', 'number',
            ['number','number','number','number','number'],
            [SRC_W, SRC_H, DST_W, DST_H, 20]);
        if (ms > 0) {
            ok(`bench_scale_webgpu returns positive`, true);
            console.log(`        GPU scale: ${ms.toFixed(2)} ms/frame`);
        } else {
            console.log(`        GPU scale: skipped (no WebGPU device in Node)`);
        }
    }
}

const cpuJs    = path.join(wasmDir, 'build-cpu/ffmpeg-cpu.js');
const webgpuJs = path.join(wasmDir, 'build-webgpu/ffmpeg-webgpu.js');

await testBuild('CPU build',    cpuJs);
await testBuild('WebGPU build', webgpuJs);

console.log(`\n${passed + failed + skipped} tests — ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
process.exit(failed > 0 ? 1 : 0);
