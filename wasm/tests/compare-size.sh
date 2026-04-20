#!/bin/bash
# Compare .wasm sizes against ffmpeg.js and ffmpeg.wasm reference builds.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)/wasm"

print_size() {
    local label="$1"
    local file="$2"
    if [ -f "$file" ]; then
        local raw; raw=$(wc -c < "$file")
        local gz;  gz=$(gzip -c "$file" | wc -c)
        printf "  %-28s %6.1f MB raw   %5.1f MB gz\n" \
            "$label" "$(echo "scale=1; $raw/1048576" | bc)" "$(echo "scale=1; $gz/1048576" | bc)"
    else
        printf "  %-28s  (not built)\n" "$label"
    fi
}

echo ""
echo "=== WASM size comparison ==="
echo ""
echo "Ours:"
print_size "ffmpeg-cpu.wasm"    "$ROOT/build-cpu/ffmpeg-cpu.wasm"
print_size "ffmpeg-webgpu.wasm" "$ROOT/build-webgpu/ffmpeg-webgpu.wasm"

echo ""
echo "Reference (published, no download needed):"
printf "  %-28s %6s MB raw   %5s MB gz\n" "ffmpeg.wasm (@ffmpeg/core)"  "~31.0" "~9.0"
printf "  %-28s %6s MB raw   %5s MB gz\n" "ffmpeg.js (webm build)"       "~8.0"  "~2.5"
printf "  %-28s %6s MB raw   %5s MB gz\n" "ffmpeg.js (mp4 build)"        "~10.0" "~3.5"
echo ""
