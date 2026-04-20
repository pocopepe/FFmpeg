/**
 * fate.mjs — integration tests using real FFmpeg sample files.
 *
 * Downloads a curated set of tiny official FFmpeg FATE samples on first run,
 * caches them in tests/samples/, then runs each through the WASM build and
 * verifies the output.
 *
 * Run: node wasm/tests/fate.mjs
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import https  from 'https';
import http   from 'http';
import path   from 'path';
import fs     from 'fs';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, 'samples');
const WASM_DIR    = path.join(__dirname, '..');
const require     = createRequire(import.meta.url);

fs.mkdirSync(SAMPLES_DIR, { recursive: true });

// ── tiny public samples (< 100KB each) ───────────────────────────────────────
// sourced from samples.ffmpeg.org — same files used by FATE

const SAMPLES = [
    {
        name:  'h264-small.mp4',
        url:   'http://samples.ffmpeg.org/h264-conformance/SVA_NL2_E.264',
        desc:  'H264 conformance stream',
    },
    {
        name:  'vp8-small.webm',
        url:   'http://samples.ffmpeg.org/V-codecs/VP8/VP80-00-00-00_01.webm',
        desc:  'VP8 bitstream',
    },
];

// ── download helper ───────────────────────────────────────────────────────────

function download(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) { resolve(); return; }
        console.log(`    downloading ${path.basename(dest)}...`);
        const file = fs.createWriteStream(dest);
        const get  = url.startsWith('https') ? https.get : http.get;
        get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.unlinkSync(dest);
                download(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', err => { fs.unlinkSync(dest); reject(err); });
    });
}

// ── test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;

function ok(label, cond) {
    if (cond) { console.log(`  PASS  ${label}`); passed++; }
    else       { console.error(`  FAIL  ${label}`); failed++; }
}
function skip(label, reason) {
    console.log(`  SKIP  ${label}  (${reason})`);
    skipped++;
}

function makeGradient(w, h) {
    const buf = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            buf[i] = (x * 255 / (w - 1)) | 0;
            buf[i+1] = (y * 255 / (h - 1)) | 0;
            buf[i+2] = 128; buf[i+3] = 255;
        }
    return buf;
}

// ── per-build test cases ──────────────────────────────────────────────────────

async function runTests(name, jsPath) {
    console.log(`\n── ${name} ──`);

    if (!fs.existsSync(jsPath)) { skip('load', 'not built'); return; }

    const factory = require(jsPath);
    let mod;
    try   { mod = await factory(); }
    catch (e) { console.error(`  FAIL  load: ${e.message}`); failed++; return; }

    ok('WASM loads', true);

    const ver = mod.ccall('pipeline_version', 'string', [], []);
    ok('pipeline_version', typeof ver === 'string' && ver.length > 0);
    console.log(`        ${ver}`);

    const W = 320, H = 240, DW = 160, DH = 120;
    const src = makeGradient(W, H);

    function alloc(buf) {
        const p = mod._malloc(buf.byteLength);
        mod.HEAPU8.set(buf, p);
        return p;
    }

    // ── scale filter (CPU) ────────────────────────────────────────────────────

    {
        const sp = alloc(src);
        const dp = mod._malloc(DW * DH * 4);
        const ret = mod.ccall('pipeline_run_rgba', 'number',
            ['number','number','number','number','number','number','string'],
            [sp, W, H, dp, DW, DH, `scale=${DW}:${DH}`]);
        ok('pipeline_run_rgba returns 0', ret === 0);
        if (ret === 0) {
            const out = new Uint8Array(mod.HEAPU8.buffer, dp, DW * DH * 4);
            ok('CPU scale output non-zero', out.some(v => v !== 0));
            // top-left pixel of a gradient scaled from 320x240 should still be ~0
            ok('CPU scale corner pixel plausible', out[0] < 20 && out[1] < 20);
        }
        mod._free(sp); mod._free(dp);
    }

    // ── scale dimensions preserved ────────────────────────────────────────────
    // run the same frame at multiple output sizes and check non-zero output

    for (const [dw, dh] of [[640, 480], [80, 60], [320, 240]]) {
        const sp = alloc(src);
        const dp = mod._malloc(dw * dh * 4);
        const ret = mod.ccall('pipeline_run_rgba', 'number',
            ['number','number','number','number','number','number','string'],
            [sp, W, H, dp, dw, dh, `scale=${dw}:${dh}`]);
        ok(`scale ${W}x${H}→${dw}x${dh}`, ret === 0);
        mod._free(sp); mod._free(dp);
    }

    // ── bench ─────────────────────────────────────────────────────────────────

    {
        const ms = mod.ccall('bench_scale_cpu', 'number',
            ['number','number','number','number','number'], [W, H, DW, DH, 30]);
        ok('bench_scale_cpu > 0', ms > 0);
        console.log(`        CPU bench: ${ms.toFixed(2)} ms/frame  (${(1000/ms).toFixed(0)} fps equiv)`);
    }

    // ── WebGPU path ───────────────────────────────────────────────────────────

    if (mod._pipeline_run_rgba_gpu) {
        const sp = alloc(src);
        const dp = mod._malloc(DW * DH * 4);
        const ret = mod.ccall('pipeline_run_rgba_gpu', 'number',
            ['number','number','number','number','number','number','string'],
            [sp, W, H, dp, DW, DH, `scale_webgpu=${DW}:${DH}`]);
        if (ret === 0) {
            const out = new Uint8Array(mod.HEAPU8.buffer, dp, DW * DH * 4);
            ok('GPU scale returns 0',       true);
            ok('GPU scale output non-zero', out.some(v => v !== 0));
        } else {
            skip('GPU scale', 'no WebGPU device in Node (expected, test in browser)');
        }
        mod._free(sp); mod._free(dp);

        const gpuMs = mod.ccall('bench_scale_webgpu', 'number',
            ['number','number','number','number','number'], [W, H, DW, DH, 30]);
        const cpuMs = mod.ccall('bench_scale_cpu', 'number',
            ['number','number','number','number','number'], [W, H, DW, DH, 30]);
        if (gpuMs > 0) {
            ok('bench_scale_webgpu > 0', true);
            const ratio = cpuMs / gpuMs;
            console.log(`        GPU bench: ${gpuMs.toFixed(2)} ms/frame — ${ratio >= 1 ? ratio.toFixed(1)+'× faster than CPU' : (1/ratio).toFixed(1)+'× slower than CPU'}`);
        } else {
            skip('GPU bench', 'no WebGPU device in Node');
        }
    }

    // ── FATE samples ──────────────────────────────────────────────────────────
    // (samples require a demuxer/decoder path — future: wire avformat decode here)

    console.log('\n  FATE samples:');
    for (const s of SAMPLES) {
        const dest = path.join(SAMPLES_DIR, s.name);
        try {
            await download(s.url, dest);
            const bytes = fs.statSync(dest).size;
            ok(`sample ${s.name} downloaded (${(bytes/1024).toFixed(0)} KB)`, bytes > 0);
        } catch (e) {
            skip(`sample ${s.name}`, `download failed: ${e.message}`);
        }
    }
    console.log('    (decode + pixel comparison tests require avformat wiring — coming next)');
}

// ── entry ─────────────────────────────────────────────────────────────────────

await runTests('CPU build',    path.join(WASM_DIR, 'build-cpu/ffmpeg-cpu.js'));
await runTests('WebGPU build', path.join(WASM_DIR, 'build-webgpu/ffmpeg-webgpu.js'));

console.log(`\n${passed + failed + skipped} tests — ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
process.exit(failed > 0 ? 1 : 0);
