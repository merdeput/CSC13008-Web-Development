$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  throw 'Create .env from .env.example and configure your database first.'
}
$configDir = Join-Path $projectRoot 'seaweedfs'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$configFile = Join-Path $configDir 's3.json'
if (Test-Path -LiteralPath $configFile) {
  Write-Host 'SeaweedFS credentials already exist; leaving them unchanged.'
  exit 0
}
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$accessBytes = New-Object byte[] 8
$secretBytes = New-Object byte[] 32
$adminAccessBytes = New-Object byte[] 8
$adminSecretBytes = New-Object byte[] 32
$rng.GetBytes($accessBytes)
$rng.GetBytes($secretBytes)
$rng.GetBytes($adminAccessBytes)
$rng.GetBytes($adminSecretBytes)
$rng.Dispose()
$access = 'gallery-' + ([BitConverter]::ToString($accessBytes) -replace '-', '').ToLowerInvariant()
$secret = ([BitConverter]::ToString($secretBytes) -replace '-', '').ToLowerInvariant()
$adminAccess = 'bootstrap-' + ([BitConverter]::ToString($adminAccessBytes) -replace '-', '').ToLowerInvariant()
$adminSecret = ([BitConverter]::ToString($adminSecretBytes) -replace '-', '').ToLowerInvariant()
$config = @{ identities = @(
  @{ name = 'gallery-server'; credentials = @(@{ accessKey = $access; secretKey = $secret }); actions = @('Read:photo-originals', 'Write:photo-originals', 'Read:photo-variants', 'Write:photo-variants') },
  @{ name = 'bootstrap-admin'; credentials = @(@{ accessKey = $adminAccess; secretKey = $adminSecret }); actions = @('Admin', 'Read', 'Write', 'List') },
  @{ name = 'anonymous'; actions = @('Read:photo-variants') }
) }
[System.IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $configDir 'admin.env'), "SEAWEED_ADMIN_ACCESS_KEY=$adminAccess`nSEAWEED_ADMIN_SECRET_KEY=$adminSecret`n", (New-Object System.Text.UTF8Encoding($false)))
Add-Content -LiteralPath $envFile -Value "`nSEAWEED_S3_ENDPOINT=http://127.0.0.1:8333`nSEAWEED_S3_REGION=us-east-1`nSEAWEED_S3_ACCESS_KEY=$access`nSEAWEED_S3_SECRET_KEY=$secret`nSEAWEED_PUBLIC_URL=http://127.0.0.1:8333`n"
Write-Host 'Created private SeaweedFS S3 configuration and appended server credentials to .env.'
