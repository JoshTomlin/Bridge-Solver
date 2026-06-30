param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command emcmake -ErrorAction SilentlyContinue)) {
    throw "Emscripten is not active. Install emsdk and run emsdk_env.ps1 first."
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDir = Join-Path $repoRoot "build-wasm"

emcmake cmake -S $repoRoot -B $buildDir -DCMAKE_BUILD_TYPE=$Configuration
cmake --build $buildDir --config $Configuration

Push-Location (Join-Path $repoRoot "website")
try {
    npm run build
    npm run test:wasm
} finally {
    Pop-Location
}

Write-Host "Web build ready in website\dist"
