$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot 'backup'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $backupRoot ("4bloques-$timestamp")

New-Item -ItemType Directory -Path $destination -Force | Out-Null

$source = $projectRoot
$logFile = Join-Path $backupRoot 'backup-hourly.log'

robocopy $source $destination /E /R:1 /W:1 /XD node_modules .next backup .git /XF '*.log' | Out-Null

$exitCode = $LASTEXITCODE
if ($exitCode -ge 8) {
    throw "robocopy failed with exit code $exitCode"
}

Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup created at $destination"