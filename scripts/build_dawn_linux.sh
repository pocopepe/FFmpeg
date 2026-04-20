#!/bin/bash
set -e

apt-get update && apt-get install -y \
    git python3 cmake ninja-build clang nasm \
    pkg-config libx11-dev libxrandr-dev libxinerama-dev \
    libxcursor-dev libxi-dev libx11-xcb-dev libgl1-mesa-dev

git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git ~/depot_tools
export PATH="$HOME/depot_tools:$PATH"

mkdir ~/dawn && cd ~/dawn && fetch dawn

cd ~/dawn/dawn
cmake -GNinja -B out/Release \
    -DCMAKE_BUILD_TYPE=Release \
    -DDAWN_BUILD_SAMPLES=OFF \
    -DDAWN_ENABLE_DESKTOP_GL=OFF \
    -DDAWN_ENABLE_OPENGLES=OFF \
    -DTINT_BUILD_TESTS=OFF

ninja -C out/Release -j$(nproc)

echo "Dawn built. Headers: ~/dawn/dawn/include and ~/dawn/dawn/out/Release/gen/include"
echo "Libs: ~/dawn/dawn/out/Release/src/dawn/"
