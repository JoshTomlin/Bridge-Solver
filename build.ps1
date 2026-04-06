param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",

    [switch]$Run
)

$ErrorActionPreference = "Stop"

$vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"

if (-not (Test-Path -LiteralPath $vsDevCmd)) {
    throw "VsDevCmd.bat was not found. Expected path: $vsDevCmd"
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDir = Join-Path $repoRoot "build"
$runSegment = ""

if ($Run) {
    $exePath = Join-Path $buildDir "engine\$Configuration\bridge_engine_cli.exe"
    $runSegment = " && `"$exePath`""
}

$command = @(
    "`"$vsDevCmd`""
    "&& cmake -S `"$repoRoot`" -B `"$buildDir`""
    "&& cmake --build `"$buildDir`" --config $Configuration"
    $runSegment
) -join " "

cmd /c $command

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
