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
$buildTypeArgument = "-DCMAKE_BUILD_TYPE=$Configuration"

emcmake cmake -S $repoRoot -B $buildDir $buildTypeArgument
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

cmake --build $buildDir --config $Configuration
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Push-Location (Join-Path $repoRoot "website")
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    npm run test:wasm
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host "Web build ready in website\dist"
