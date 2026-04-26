param(
    [string]$OutputRoot,
    [string]$DatabaseUrl,
    [switch]$SkipDatabase,
    [switch]$IncludeNodeModules
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[backup-migration] $Message"
}

function Get-RequiredCommand {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Required command '$Name' was not found in PATH."
    }
    return $command
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

if (-not $OutputRoot) {
    $OutputRoot = Join-Path $projectRoot 'backup'
}

$targetDir = Join-Path $OutputRoot ("migration-$timestamp")
$dbDir = Join-Path $targetDir 'db'
$metaDir = Join-Path $targetDir 'meta'

New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
New-Item -ItemType Directory -Path $metaDir -Force | Out-Null

Write-Step "Target folder: $targetDir"

$resolvedDatabaseUrl = $DatabaseUrl
if (-not $resolvedDatabaseUrl) {
    $resolvedDatabaseUrl = $env:DATABASE_URL
}

if (-not $SkipDatabase) {
    if (-not $resolvedDatabaseUrl) {
        throw "DATABASE_URL is missing. Set env:DATABASE_URL or pass -DatabaseUrl."
    }

    $pgDumpCommand = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($pgDumpCommand) {
        $dbCustomDumpPath = Join-Path $dbDir 'postgres.backup'
        $dbSqlDumpPath = Join-Path $dbDir 'postgres.sql'

        Write-Step 'Creating PostgreSQL custom dump (postgres.backup)...'
        & pg_dump --dbname "$resolvedDatabaseUrl" --format=custom --no-owner --no-privileges --file "$dbCustomDumpPath"

        Write-Step 'Creating PostgreSQL SQL dump (postgres.sql)...'
        & pg_dump --dbname "$resolvedDatabaseUrl" --format=plain --no-owner --no-privileges --file "$dbSqlDumpPath"
    }
    else {
        Write-Step 'pg_dump not found. Falling back to JSON export via Node script...'
        $jsonDumpDir = Join-Path $dbDir 'json'
        New-Item -ItemType Directory -Path $jsonDumpDir -Force | Out-Null
        & node (Join-Path $PSScriptRoot 'backup-db-json.mjs') --output="$jsonDumpDir" --databaseUrl="$resolvedDatabaseUrl"
    }
}
else {
    Write-Step 'Skipping database dump by request.'
}

$webArchivePath = Join-Path $targetDir 'web-source.zip'

Write-Step 'Collecting web source files...'
$excludedDirectories = @('.git', '.next', 'backup')
if (-not $IncludeNodeModules) {
    $excludedDirectories += 'node_modules'
}

$fileList = Get-ChildItem -Path $projectRoot -Recurse -File | Where-Object {
    $fullName = $_.FullName

    foreach ($dir in $excludedDirectories) {
        $pattern = [IO.Path]::DirectorySeparatorChar + $dir + [IO.Path]::DirectorySeparatorChar
        if ($fullName.Contains($pattern)) {
            return $false
        }
    }

    if ($fullName.Contains(([IO.Path]::DirectorySeparatorChar + 'driver-app' + [IO.Path]::DirectorySeparatorChar + 'node_modules' + [IO.Path]::DirectorySeparatorChar))) {
        return $false
    }

    return $true
} | Select-Object -ExpandProperty FullName

if (-not $fileList -or $fileList.Count -eq 0) {
    throw 'No files found for web-source archive.'
}

Write-Step 'Creating web-source.zip...'
Compress-Archive -Path $fileList -DestinationPath $webArchivePath -CompressionLevel Optimal

$storagePath = Join-Path $projectRoot 'storage'
if (Test-Path $storagePath) {
    $storageArchivePath = Join-Path $targetDir 'storage.zip'
    Write-Step 'Creating storage.zip...'
    Compress-Archive -Path (Join-Path $storagePath '*') -DestinationPath $storageArchivePath -CompressionLevel Optimal
}
else {
    Write-Step 'No local storage folder found. Skipping storage.zip.'
}

$restoreHintsPath = Join-Path $metaDir 'restore-hints.txt'
$restoreHints = @(
    'Restore hints',
    '=============',
    '',
    '1) Restore DB (custom backup preferred):',
    '   pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" db/postgres.backup',
    '',
    '2) Or restore DB from SQL:',
    '   psql "$DATABASE_URL" -f db/postgres.sql',
    '',
    '3) Deploy web-source.zip on target server, then configure env vars:',
    '   NEXTAUTH_URL, NEXTAUTH_SECRET, DATABASE_URL, STORAGE_ROOT, SMTP_*',
    '',
    '4) If using file storage, unpack storage.zip into STORAGE_ROOT.'
)
$restoreHints | Set-Content -Path $restoreHintsPath -Encoding UTF8

$manifestPath = Join-Path $metaDir 'manifest.json'
$manifest = [ordered]@{
    createdAt = (Get-Date).ToString('o')
    projectRoot = $projectRoot
    targetDir = $targetDir
    includesDatabase = (-not $SkipDatabase)
    includesNodeModules = [bool]$IncludeNodeModules
    files = Get-ChildItem -Path $targetDir -Recurse -File | ForEach-Object {
        [ordered]@{
            name = $_.Name
            relativePath = $_.FullName.Replace($targetDir + [IO.Path]::DirectorySeparatorChar, '')
            sizeBytes = $_.Length
        }
    }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Step 'Backup package created successfully.'
Write-Step "Open folder: $targetDir"