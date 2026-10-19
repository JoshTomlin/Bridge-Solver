param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [string]$ToolsRoot = (Join-Path $PSScriptRoot "..\.tools"),
    [ValidateRange(1, 32)]
    [int]$Parallel = 2
)

$ErrorActionPreference = "Stop"

function Find-LocalTool([string]$DirectoryPattern, [string]$RelativePath) {
    if (-not (Test-Path -LiteralPath $ToolsRoot)) { return $null }
    foreach ($directory in (Get-ChildItem -LiteralPath $ToolsRoot -Directory -Filter $DirectoryPattern | Sort-Object Name -Descending)) {
        $candidate = Join-Path $directory.FullName $RelativePath
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

$localSdkEnvironment = Join-Path $ToolsRoot "emsdk\emsdk_env.ps1"
if (-not (Get-Command emcmake -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $localSdkEnvironment)) {
    $env:EMSDK_QUIET = "1"
    & $localSdkEnvironment
}

if (-not (Get-Command emcmake -ErrorAction SilentlyContinue)) {
    throw "Emscripten is not active. Install emsdk and run emsdk_env.ps1 first."
}

$cmakeCommand = Get-Command cmake.exe -ErrorAction SilentlyContinue
$cmakeExecutable = if ($cmakeCommand) { $cmakeCommand.Source } else { Find-LocalTool "cmake-*-windows-x86_64" "bin\cmake.exe" }

if (-not $cmakeExecutable) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswhere) {
        $vsInstallPath = & $vswhere -latest -products * -property installationPath |
            Select-Object -First 1
        if ($vsInstallPath) {
            $cmakePath = Join-Path $vsInstallPath "Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
            if (Test-Path -LiteralPath $cmakePath) {
                $cmakeExecutable = $cmakePath
            }
        }
    }
}

if (-not $cmakeExecutable) {
    throw "CMake was not found. Install CMake 3.20 or newer and add it to PATH."
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDir = Join-Path $repoRoot "build-wasm"
$buildTypeArgument = "-DCMAKE_BUILD_TYPE=$Configuration"
$configureArguments = @("-S", $repoRoot, "-B", $buildDir, $buildTypeArgument)
$localMake = Find-LocalTool "llvm-mingw-*-ucrt-x86_64" "bin\mingw32-make.exe"
$cachePath = Join-Path $buildDir "CMakeCache.txt"
if (Test-Path -LiteralPath $cachePath) {
    # emcmake checks for a generator before CMake reads its existing cache.
    $cachedGenerator = [regex]::Match((Get-Content -LiteralPath $cachePath -Raw), '(?m)^CMAKE_GENERATOR:INTERNAL=(.+)$').Groups[1].Value.Trim()
    if ($cachedGenerator) { $configureArguments += @("-G", $cachedGenerator) }
} elseif ($localMake -and -not $env:CMAKE_GENERATOR) {
    $configureArguments += @("-G", "MinGW Makefiles", "-DCMAKE_MAKE_PROGRAM=$localMake")
}

# Explicit executable paths also work when tools were installed only in this workspace.
emcmake $cmakeExecutable @configureArguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& $cmakeExecutable --build $buildDir --config $Configuration --parallel $Parallel
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Push-Location (Join-Path $repoRoot "website")
try {
    # These scripts have no package dependencies; npm is not required to build.
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { $env:EMSDK_NODE }
    if (-not $nodeExecutable) { throw "Node.js was not found. Activate the SDK or install Node.js." }
    & $nodeExecutable build.js
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    & $nodeExecutable wasm-smoke.mjs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host "Web build ready in website\dist"
