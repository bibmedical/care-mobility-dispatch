$ErrorActionPreference = 'Stop'

function To-TitleCase([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return '' }
  $parts = $value.ToLower().Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
  return ($parts | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join ' '
}

$path = 'storage/nemt-admin.json'
$data = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
if (-not $data.drivers) { throw 'drivers array not found in storage/nemt-admin.json' }

$licenseFiles = Get-ChildItem -LiteralPath 'LICENCE' -Recurse -File -Include *.jpg, *.jpeg, *.png
if (-not $licenseFiles -or $licenseFiles.Count -eq 0) { throw 'No license images found in LICENCE folder.' }

$maxNum = 0
foreach ($d in $data.drivers) {
  $ln = [string]$d.licenseNumber
  if ($ln -match 'DL-(\d+)$') {
    $n = [int]$Matches[1]
    if ($n -gt $maxNum) { $maxNum = $n }
  }
}

$template = $data.drivers[0] | ConvertTo-Json -Depth 30 | ConvertFrom-Json
$created = @()
$updated = @()
$repoRoot = (Get-Location).Path

foreach ($file in $licenseFiles) {
  $folderToken = $file.Directory.Name.Trim().ToUpper()
  $baseNoExt = [System.IO.Path]::GetFileNameWithoutExtension($file.Name).ToUpper()
  $nameTokens = ($baseNoExt -replace 'LICENCIA', '' -replace 'LICENCE', '' -replace 'LICENSE', '').Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object { $_.Length -ge 3 }

  $best = $null
  $bestScore = -1
  foreach ($d in $data.drivers) {
    $haystack = ("$($d.firstName) $($d.lastName) $($d.displayName) $($d.username)").ToUpper()
    $score = 0
    if ($haystack.Contains($folderToken)) { $score += 3 }
    foreach ($t in $nameTokens) {
      if ($haystack.Contains($t)) { $score += 1 }
    }
    if ($score -gt $bestScore) {
      $bestScore = $score
      $best = $d
    }
  }

  $relPath = (Resolve-Path -LiteralPath $file.FullName -Relative)
  $relPath = ($relPath -replace '^[.][/\\]', '') -replace '\\', '/'

  if ($best -and $bestScore -gt 0) {
    if (-not $best.documents) {
      $best | Add-Member -NotePropertyName documents -NotePropertyValue ([pscustomobject]@{})
    }
    $best.documents.licenseFront = $relPath
    $best.documents.licenseBack = $relPath
    if ([string]::IsNullOrWhiteSpace([string]$best.licenseNumber)) {
      $maxNum++
      $best.licenseNumber = ('DL-{0:D6}' -f $maxNum)
    }
    if ([string]::IsNullOrWhiteSpace([string]$best.licenseClass)) { $best.licenseClass = 'E' }
    if ([string]::IsNullOrWhiteSpace([string]$best.licenseState)) { $best.licenseState = 'FL' }
    $updated += "$($best.displayName) <= $relPath"
    continue
  }

  $firstName = To-TitleCase($folderToken)
  $lastName = 'Driver'
  $displayName = "$firstName $lastName"
  $username = ($firstName -replace '\\s+', '').ToLower()

  $new = $template | ConvertTo-Json -Depth 30 | ConvertFrom-Json
  $new.firstName = $firstName
  $new.middleInitial = ''
  $new.lastName = $lastName
  $new.displayName = $displayName
  $new.username = $username
  $new.portalUsername = $username
  $new.email = "$username.license@caremobilityservices.local"
  $new.portalEmail = $new.email
  $new.phone = ''
  $new.notes = 'Created from LICENCE folder import'
  $new.profileStatus = 'Active'
  $new.role = 'Driver(Driver)'
  $new.vehicleId = ''
  $new.groupingId = 'grp-3'
  $new.position = @(28.5383, -81.3792)
  if (-not $new.documents) { $new | Add-Member -NotePropertyName documents -NotePropertyValue ([pscustomobject]@{}) }
  $new.documents.licenseFront = $relPath
  $new.documents.licenseBack = $relPath
  $new.documents.profilePhoto = $null
  $new.documents.insuranceCertificate = $null
  $new.documents.w9Document = $null
  $new.documents.trainingCertificate = $null
  $maxNum++
  $new.licenseNumber = ('DL-{0:D6}' -f $maxNum)
  $new.licenseClass = 'E'
  $new.licenseState = 'FL'
  $new.password = "$firstName@00"
  $new.webAccess = $true
  $new.androidAccess = $true
  $new.authUserId = ''

  $baseId = ('drv-' + ($firstName.ToLower() -replace '[^a-z0-9]+', '-'))
  $id = $baseId
  $idx = 1
  $ids = @($data.drivers | ForEach-Object { [string]$_.id })
  while ($ids -contains $id) {
    $idx++
    $id = "$baseId-$idx"
  }
  $new.id = $id

  $data.drivers += $new
  $created += "$displayName <= $relPath"
}

$data.version = 2
($data | ConvertTo-Json -Depth 40) | Set-Content -LiteralPath $path -Encoding UTF8

Write-Output "UPDATED_COUNT=$($updated.Count)"
$updated | ForEach-Object { Write-Output ("UPDATED: " + $_) }
Write-Output "CREATED_COUNT=$($created.Count)"
$created | ForEach-Object { Write-Output ("CREATED: " + $_) }
