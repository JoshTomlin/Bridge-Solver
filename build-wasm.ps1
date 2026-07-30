param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command emcmake -ErrorAction SilentlyContinue)) {
    throw "Emscripten is not active. Install emsdk and run emsdk_env.ps1 first."
}

if (-not (Get-Command cmake.exe -ErrorAction SilentlyContinue)) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswhere) {
        $vsInstallPath = & $vswhere -latest -products * -property installationPath |
            Select-Object -First 1
        if ($vsInstallPath) {
            $cmakePath = Join-Path $vsInstallPath "Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
            if (Test-Path -LiteralPath $cmakePath) {
                $env:Path = (Split-Path -Parent $cmakePath) + ";" + $env:Path
            }
        }
    }
}

if (-not (Get-Command cmake.exe -ErrorAction SilentlyContinue)) {
    throw "CMake was not found. Install CMake 3.20 or newer and add it to PATH."
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
