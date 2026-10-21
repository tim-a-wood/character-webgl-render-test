#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export npm_config_cache="${npm_config_cache:-$PWD/.npm-cache}"
VIEWER_SHA=97656b51ca86c973eb087ed1483012eaf0af55aa
RENDERER_SHA=5650e2c8958801445ac0b38937a83984e3a6b278
ENVIRONMENT_SHA=3a030b54c2e4f0f4d469eec2f98f47398c9a2a30
ASSETS_SHA=15cd02d304e54cb42a4db4eefe719f76190f4b68
download() {
  local url="$1" file="$2" hash="$3"
  if [ ! -f "$file" ]; then curl --fail --location --retry 2 --max-time 120 "$url" --output "$file"; fi
  echo "$hash  $file" | sha256sum --check --status
}
download "https://codeload.github.com/KhronosGroup/glTF-Sample-Viewer/tar.gz/$VIEWER_SHA" viewer.tar.gz a2b2b7bc9e3f96f4ecd6c41ae608673702ed5e1620c9665651c7edd06b34323a
download "https://codeload.github.com/KhronosGroup/glTF-Sample-Renderer/tar.gz/$RENDERER_SHA" renderer.tar.gz a60a9ad2823cb77d6a091bbc44756d2bec09809f19ff8e8bea2c97469116fb11
if [ ! -d official-viewer ]; then
  mkdir -p official-viewer
  tar -xzf viewer.tar.gz --strip-components=1 -C official-viewer
  tar -xzf renderer.tar.gz --strip-components=1 -C official-viewer/glTF-Sample-Renderer
fi
mkdir -p fixtures
download "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/$ASSETS_SHA/Models/model-index.json" fixtures/model-index.json 91c2e5fb4e500e45011065bc7ff0b5ee357dbfc2c9a10e9bd85e944fe3c90ff4
download "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/$ENVIRONMENT_SHA/Cannon_Exterior.hdr" fixtures/Cannon_Exterior.hdr 7d65926ed2fa41c121738af2addf1fd5f1ae42d12ff77255e2679777f06c984b
download "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/$ENVIRONMENT_SHA/Cannon_Exterior.hdr.license" fixtures/Cannon_Exterior.hdr.license 5387a07d4ff9743ed01148854ed0b4dc0529b33579c979c49002cdde8e031f1e
# Diagnostic references and optional application-level directional-light configuration.
# No edits to the loader, renderer, shaders, skinning or morph algorithms; verify pinned bytes.
node patch-diagnostics71.cjs
npm --prefix official-viewer/glTF-Sample-Renderer ci --ignore-scripts --no-audit --no-fund
npm --prefix official-viewer/glTF-Sample-Renderer run build
npm --prefix official-viewer ci --ignore-scripts --no-audit --no-fund
(cd official-viewer && SOURCEMAP=false npx --no-install vite build)
node -e "const fs=require('fs'),c=require('crypto'),p=require('path'); const h=f=>c.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); const files=['viewer.tar.gz','renderer.tar.gz','official-viewer/package-lock.json','official-viewer/glTF-Sample-Renderer/package-lock.json','official-viewer/src/main.js','fixtures/model-index.json','fixtures/Cannon_Exterior.hdr','fixtures/Cannon_Exterior.hdr.license']; const out={viewer:'$VIEWER_SHA',renderer:'$RENDERER_SHA',files:files.map(file=>({file,sha256:h(file)}))}; fs.writeFileSync('upstream-build71.json',JSON.stringify(out,null,2)); console.log('UPSTREAM71_BUILD',JSON.stringify(out));"
