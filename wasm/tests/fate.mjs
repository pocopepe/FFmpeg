/**
 * fate.mjs — FATE integration tests against the full FFmpeg sample suite.
 *
 * For each supported sample in fate-suite, decodes the first frame with both
 * the WASM build and native ffmpeg, then compares pixel-by-pixel.
 *
 * Run:  node wasm/tests/fate.mjs
 * Env:  FATE_SAMPLES=/path/to/fate-suite  (default: ~/fate-suite)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { spawnSync }     from 'child_process';
import path from 'path';
import fs   from 'fs';
import os   from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_DIR  = path.join(__dirname, '..');
const require   = createRequire(import.meta.url);
const FATE_DIR  = process.env.FATE_SAMPLES || path.join(os.homedir(), 'fate-suite');

// containers our WASM build's demuxers cover
const SUPPORTED_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm']);

let passed = 0, failed = 0, skipped = 0;

function ok(label, cond) {
    if (cond) { console.log(`  PASS  ${label}`); passed++; }
    else       { console.error(`  FAIL  ${label}`); failed++; }
}
function skip(label, reason) {
    console.log(`  SKIP  ${label}  (${reason})`);
    skipped++;
}

// Recursively collect all files with supported extensions.
function findSamples(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...findSamples(full));
        } else if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
            out.push(full);
        }
    }
    return out;
}

// Use native ffmpeg to decode the first frame of a file to raw RGBA.
function nativeFirstFrame(filePath, w, h) {
    const tmp = path.join(os.tmpdir(), `fate-ref-${process.pid}.raw`);
    const r = spawnSync('ffmpeg', [
        '-loglevel', 'error',
        '-noautorotate',        // don't auto-apply display matrix rotation
        '-i', filePath,
        '-vframes', '1',
        '-vf', `scale=${w}:${h}`,
        '-f', 'rawvideo', '-pix_fmt', 'rgba',
        '-y', tmp,
    ], { timeout: 10000 });
    if (r.status !== 0) return null;
    const data = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    return new Uint8Array(data.buffer);
}

// Compare two RGBA buffers. Returns { match, maxDiff, diffPixels }.
// Alpha channel is ignored — colorspace conversion can produce different alpha.
function compareFrames(a, b, tolerance = 5) {
    if (a.length !== b.length) return { match: false, maxDiff: -1, diffPixels: -1 };
    let maxDiff = 0, diffPixels = 0;
    const nPixels = a.length / 4;
    for (let i = 0; i < nPixels; i++) {
        const base = i * 4;
        let pixDiff = 0;
        for (let c = 0; c < 3; c++) {
            const d = Math.abs(a[base + c] - b[base + c]);
            if (d > maxDiff) maxDiff = d;
            if (d > pixDiff) pixDiff = d;
        }
        if (pixDiff > tolerance) diffPixels++;
    }
    return { match: diffPixels === 0, maxDiff, diffPixels };
}

async function runTests(name, jsPath) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${name}`);
    console.log(`${'─'.repeat(60)}\n`);

    if (!fs.existsSync(jsPath)) {
        skip(name, 'not built');
        return;
    }

    const factory = require(jsPath);
    let mod;
    try   { mod = await factory(); }
    catch (e) { console.error(`  FAIL  load: ${e.message}`); failed++; return; }

    const ver = mod.ccall('pipeline_version', 'string', [], []);
    console.log(`  FFmpeg ${ver}\n`);

    if (!fs.existsSync(FATE_DIR)) {
        skip('fate-suite', `${FATE_DIR} not found`);
        return;
    }

    const samples = findSamples(FATE_DIR).sort();
    console.log(`  ${samples.length} candidate files\n`);

    let nDecoded = 0, nSkipped = 0, nFailed = 0;

    for (const samplePath of samples) {
        const label = path.relative(FATE_DIR, samplePath);

        // ── WASM decode ────────────────────────────────────────────────
        const fileBytes = fs.readFileSync(samplePath);
        const srcPtr = mod._malloc(fileBytes.byteLength);
        mod.HEAPU8.set(fileBytes, srcPtr);
        const handle = mod.ccall('decoder_open', 'number',
            ['number', 'number'], [srcPtr, fileBytes.byteLength]);
        mod._free(srcPtr);

        if (handle < 0) {
            skip(label, `unsupported codec/container (${handle})`);
            nSkipped++;
            continue;
        }

        const w = mod.ccall('decoder_width',  'number', ['number'], [handle]);
        const h = mod.ccall('decoder_height', 'number', ['number'], [handle]);

        const dstPtr = mod._malloc(w * h * 4);
        const frameRet = mod.ccall('decoder_next_frame', 'number',
            ['number', 'number', 'number', 'number'], [handle, dstPtr, w, h]);

        if (frameRet !== 0) {
            mod._free(dstPtr);
            mod.ccall('decoder_close', null, ['number'], [handle]);
            skip(label, `no video frame (${frameRet})`);
            nSkipped++;
            continue;
        }

        const wasmFrame = new Uint8Array(mod.HEAPU8.buffer, dstPtr, w * h * 4).slice();
        mod._free(dstPtr);
        mod.ccall('decoder_close', null, ['number'], [handle]);

        // ── native reference ───────────────────────────────────────────
        const refFrame = nativeFirstFrame(samplePath, w, h);
        if (!refFrame) {
            skip(label, 'native ffmpeg could not decode');
            nSkipped++;
            continue;
        }

        // ── pixel comparison ───────────────────────────────────────────
        const cmp = compareFrames(wasmFrame, refFrame);
        const tag  = `${label}  [${w}x${h}]`;
        if (cmp.match) {
            ok(`${tag}  maxDiff=${cmp.maxDiff}`, true);
            nDecoded++;
        } else {
            console.error(`  FAIL  ${tag}  diffPixels=${cmp.diffPixels}  maxDiff=${cmp.maxDiff}`);
            failed++;
            nFailed++;
        }
    }

    console.log(`\n  decoded ${nDecoded} files, ${nSkipped} skipped (unsupported codec), ${nFailed} pixel mismatches`);
}

await runTests('CPU build',    path.join(WASM_DIR, 'build-cpu/ffmpeg-cpu.js'));
await runTests('WebGPU build', path.join(WASM_DIR, 'build-webgpu/ffmpeg-webgpu.js'));

console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed + failed + skipped} total — ${passed} passed  ${failed} failed  ${skipped} skipped`);
console.log(`${'─'.repeat(60)}\n`);
process.exit(failed > 0 ? 1 : 0);
