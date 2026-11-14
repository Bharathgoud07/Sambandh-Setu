# Generates new production-only secrets into a directory outside the repository.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/generate-prod-secrets.ps1
# No secret value is printed; only the file paths and lengths.

param(
    [string]$OutDir = "$env:USERPROFILE\.setu-secrets\prod"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-Secret([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
    } finally {
        $rng.Dispose()
    }
    return [Convert]::ToBase64String($buffer).Replace("+", "-").Replace("/", "_").TrimEnd("=")
}

$jwt = New-Secret 48
$db = New-Secret 32

[System.IO.File]::WriteAllText((Join-Path $OutDir "jwt-secret.txt"), $jwt)
[System.IO.File]::WriteAllText((Join-Path $OutDir "db-password.txt"), $db)

Write-Output "wrote jwt-secret.txt ($($jwt.Length) chars)"
Write-Output "wrote db-password.txt ($($db.Length) chars)"
Write-Output "directory: $OutDir"
Write-Output "No values printed. Paste them into the host environment; never commit them."
