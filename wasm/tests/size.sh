#!/bin/bash
# Live size comparison — no hardcoded values.
# Measures our builds and fetches npm package sizes from the registry.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fmt_size() {
    local bytes="$1"
    awk -v b="$bytes" 'BEGIN { printf "%.2f MB raw", b/1048576 }'
}

fmt_gz() {
    local file="$1"
    local gz
    gz=$(gzip -c "$file" | wc -c | tr -d ' ')
    awk -v b="$gz" 'BEGIN { printf "%.2f MB gz", b/1048576 }'
}

npm_unpacked_size() {
    local pkg="$1"
    local size
    size=$(npm show "$pkg" --json 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if isinstance(d, list): d = d[-1]
    print(d.get('dist', {}).get('unpackedSize', ''))
except: print('')
" 2>/dev/null)
    if [ -n "$size" ] && [ "$size" != "None" ]; then
        awk -v b="$size" 'BEGIN { printf "%.1f MB", b/1048576 }'
    else
        echo "unavailable"
    fi
}

echo ""
echo "=== WASM size comparison ==="
echo ""

echo "Ours:"
for build in cpu webgpu; do
    wasm="$ROOT/build-$build/ffmpeg-$build.wasm"
    if [ -f "$wasm" ]; then
        bytes=$(wc -c < "$wasm" | tr -d ' ')
        printf "  ffmpeg-%-10s  %s   %s\n" "$build.wasm" "$(fmt_size "$bytes")" "$(fmt_gz "$wasm")"
    else
        printf "  ffmpeg-%-10s  not built\n" "$build.wasm"
    fi
done

echo ""
echo "Reference (fetched from npm):"
for pkg in "@ffmpeg/core" "@ffmpeg/core-mt"; do
    size=$(npm_unpacked_size "$pkg")
    printf "  %-24s  %s (unpacked)\n" "$pkg" "$size"
done
echo ""
echo "Note: npm unpackedSize includes JS + WASM. Our sizes are WASM only."
echo ""
