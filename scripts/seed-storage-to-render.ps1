param(
  [string]$BaseUrl = 'https://care-mobility-dispatch-web.onrender.com',
  [string]$Token = '',
  [string]$StorageDir = 'storage'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw 'Missing -Token. Example: .\scripts\seed-storage-to-render.ps1 -Token "your-token"'
}

$allowed = @(
  'activity-logs.json',
  'assistant-memory.json',
  'blacklist.json',
  'email-auth-codes.json',
  'integrations.json',
  'login-failures.json',
  'nemt-admin.json',
  'nemt-dispatch.json',
  'system-messages.json',
  'system-users.json'
)

$filesPayload = @{}
foreach ($name in $allowed) {
  $path = Join-Path $StorageDir $name
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Warning "Skipping missing file: $path"
    continue
  }

  $raw = Get-Content -LiteralPath $path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    $filesPayload[$name] = @{}
  } else {
    $filesPayload[$name] = $raw | ConvertFrom-Json
  }
}

$uri = ($BaseUrl.TrimEnd('/')) + '/api/admin/seed-storage'
$body = @{ files = $filesPayload } | ConvertTo-Json -Depth 80

$result = Invoke-RestMethod -Uri $uri -Method POST -Headers @{ 'x-seed-token' = $Token; 'Content-Type' = 'application/json' } -Body $body
$result | ConvertTo-Json -Depth 10
