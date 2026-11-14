# Creates production UptimeRobot monitors (D3-14).
# Reads the API key from a file; never prints it.
# Usage:
#   powershell -File scripts/setup-prod-monitors.ps1 `
#     -NodeUrl https://sambandh-setu-api-prod.onrender.com `
#     -GuideUrl https://setu-guide-prod.onrender.com

param(
    [Parameter(Mandatory = $true)][string]$NodeUrl,
    [Parameter(Mandatory = $true)][string]$GuideUrl,
    [string]$AlertContactId = "9033668",
    [string]$ApiKeyFile = "$env:USERPROFILE\.setu-secrets\uptimerobot-api-key.txt",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ApiKeyFile)) {
    throw "UptimeRobot API key file not found: $ApiKeyFile"
}

$key = (Get-Content $ApiKeyFile -Raw).Trim()
$nodeUrl = $NodeUrl.TrimEnd("/")
$guideUrl = $GuideUrl.TrimEnd("/")

function Invoke-UptimeRobot([hashtable]$Body) {
    $Body["api_key"] = $key
    $Body["format"] = "json"
    return Invoke-RestMethod -Method Post -Uri "https://api.uptimerobot.com/v2/newMonitor" -Body $Body -TimeoutSec 30
}

function Get-Monitors {
    $body = @{ api_key = $key; format = "json" }
    return Invoke-RestMethod -Method Post -Uri "https://api.uptimerobot.com/v2/getMonitors" -Body $body -TimeoutSec 30
}

function New-ProdMonitor([string]$Name, [string]$Url) {
    if ($DryRun) {
        Write-Output "DRY-RUN $Name -> $Url"
        return
    }

    $existing = Get-Monitors
    $match = $existing.monitors | Where-Object { $_.friendly_name -eq $Name } | Select-Object -First 1
    if ($match) {
        Write-Output "EXISTS $Name id=$($match.id)"
        return
    }

    $result = Invoke-UptimeRobot @{
        friendly_name  = $Name
        url            = $Url
        type           = 1
        interval       = 300
        alert_contacts = $AlertContactId
    }
    if ($result.stat -ne "ok") {
        throw "UptimeRobot rejected $Name"
    }
    Write-Output "CREATED $Name id=$($result.monitor.id)"
}

New-ProdMonitor "Setu PROD - Node /health" "$nodeUrl/health"
New-ProdMonitor "Setu PROD - Guide /health" "$guideUrl/health"
Write-Output "Alert contact id: $AlertContactId (confirm it is the team channel)"
