param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",

    [switch]$Run
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDir = Join-Path $repoRoot "build"

# Pick up tools installed after the current terminal or host process started.
$persistentPath = @(
    [Environment]::GetEnvironmentVariable("Path", "Machine")
    [Environment]::GetEnvironmentVariable("Path", "User")
) | Where-Object { $_ }
$env:Path = (($persistentPath -join ";") + ";" + $env:Path)

$vsInstallPath = $null
$vsDevCmd = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"

if (Test-Path -LiteralPath $vswhere) {
    $vsInstallPath = & $vswhere `
        -latest `
        -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -property installationPath |
        Select-Object -First 1

    if ($vsInstallPath) {
        $vsDevCmd = Join-Path $vsInstallPath "Common7\Tools\VsDevCmd.bat"
    }
}

$windowsSdkPattern = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\Lib\*\um\x64\kernel32.lib"
$windowsSdkLibrary = Get-Item -Path $windowsSdkPattern -ErrorAction SilentlyContinue |
    Select-Object -First 1
$useMsvc = $vsDevCmd -and (Test-Path -LiteralPath $vsDevCmd) -and $windowsSdkLibrary

if ($useMsvc) {
    $runSegment = ""
    if ($Run) {
        $exePath = Join-Path $buildDir "engine\$Configuration\bridge_engine_cli.exe"
        $runSegment = " && `"$exePath`""
    }

    $command = @(
        "`"$vsDevCmd`" -arch=x64"
        "&& cmake -S `"$repoRoot`" -B `"$buildDir`""
        "&& cmake --build `"$buildDir`" --config $Configuration"
        $runSegment
    ) -join " "

    cmd /c $command
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    exit 0
}

$clangCommand = Get-Command clang++.exe -ErrorAction SilentlyContinue
if (-not $clangCommand) {
    throw "No complete native C++ toolchain was found. Install a Windows SDK for Visual Studio or add LLVM-MinGW's bin directory to PATH."
}

$cmakeCommand = Get-Command cmake.exe -ErrorAction SilentlyContinue
$makeCommand = Get-Command mingw32-make.exe -ErrorAction SilentlyContinue

if ($vsInstallPath) {
    if (-not $cmakeCommand) {
        $cmakeFallback = Join-Path $vsInstallPath "Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
        if (Test-Path -LiteralPath $cmakeFallback) {
            $cmakeCommand = Get-Item -LiteralPath $cmakeFallback
        }
    }
}

if (-not $cmakeCommand -or -not $makeCommand) {
    throw "LLVM-MinGW was found, but CMake and mingw32-make are also required for the native build."
}

$clangPath = $clangCommand.Source
$clangPathForCmake = $clangPath.Replace("\", "/")
$cmakePath = if ($cmakeCommand.Source) { $cmakeCommand.Source } else { $cmakeCommand.FullName }
$makePath = $makeCommand.Source
$makePathForCmake = $makePath.Replace("\", "/")
$runtimeOutputDirectory = (Join-Path $buildDir "engine\$Configuration").Replace("\", "/")
$env:Path = @(
    (Split-Path -Parent $clangPath)
    (Split-Path -Parent $cmakePath)
    $env:Path
) -join ";"

& $cmakePath `
    -S $repoRoot `
    -B $buildDir `
    -G "MinGW Makefiles" `
    "-DCMAKE_CXX_COMPILER=$clangPathForCmake" `
    "-DCMAKE_MAKE_PROGRAM=$makePathForCmake" `
    "-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY" `
    "-DCMAKE_BUILD_TYPE=$Configuration" `
    "-DCMAKE_RUNTIME_OUTPUT_DIRECTORY=$runtimeOutputDirectory"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& $cmakePath --build $buildDir --config $Configuration
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if ($Run) {
    $exePath = Join-Path $buildDir "engine\$Configuration\bridge_engine_cli.exe"
    & $exePath
    exit $LASTEXITCODE
}
