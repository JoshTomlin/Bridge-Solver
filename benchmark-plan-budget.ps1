param(
    [int[]]$StorageDepths = @(8, 12, 16),
    [long[]]$ContextLimits = @(250000, 500000, 1000000),
    [int]$Worlds = 10,
    [int]$SearchDepth = 26,
    [double]$Seconds = 30,
    [long]$Seed = 11565831,
    [long]$MaxNodes = 1000000,
    [double]$MiningSecondsPerLayout = 0.1,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'build/plan-budget-results'),
    [string]$Executable = (Join-Path $PSScriptRoot 'build/engine/Release/bridge_alpha_mu_lab.exe')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    throw "Build the native lab first: $Executable"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$rows = @()
$hashes = @()
foreach ($storage in $StorageDepths) {
    foreach ($contexts in $ContextLimits) {
        $name = "m$storage-c$contexts"
        $caseDirectory = Join-Path $OutputDirectory $name
        New-Item -ItemType Directory -Path $caseDirectory -Force | Out-Null
        $summaryPath = Join-Path $caseDirectory 'summary.csv'
        $logPath = Join-Path $caseDirectory 'run.log'
        Write-Output "Running $name, search M=$SearchDepth, $Worlds layouts, $Seconds seconds"
        # Each cell gets a fresh process; its memory peak is captured before replay.
        & $Executable 'plan-budget-6s' $Worlds $SearchDepth $storage $contexts $Seconds $Seed $caseDirectory $MaxNodes $MiningSecondsPerLayout 1> $summaryPath 2> $logPath
        if ($LASTEXITCODE -ne 0) { throw "Lab failed for $name; see $logPath" }
        $caseRows = @(Import-Csv -LiteralPath $summaryPath)
        if ($caseRows.Count -ne 1) { throw "Expected one summary row for $name" }
        $rows += $caseRows[0]
        $rows | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'matrix.csv') -NoTypeInformation
        $hashes += [pscustomobject]@{
            case = $name
            graph_sha256 = (Get-FileHash -LiteralPath (Join-Path $caseDirectory 'plan.dag.json') -Algorithm SHA256).Hash
            split_sha256 = (Get-FileHash -LiteralPath (Join-Path $caseDirectory 'split.csv') -Algorithm SHA256).Hash
        }
        $hashes | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'hashes.csv') -NoTypeInformation
        $caseRows[0] | Select-Object requested_storage_m, max_contexts, completed_storage_m,
            stop_reason, total_ms, peak_working_set_after_build, training_mine_survived,
            holdout_mine_losses, holdout_mine_completed | ConvertTo-Json -Compress
    }
}
Write-Output "Results: $(Join-Path $OutputDirectory 'matrix.csv')"
