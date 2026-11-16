# Production smoke test wrapper for Windows (D3-12).
# Usage: powershell -File scripts/smoke-test.ps1 --base-url https://api.example --guide-url https://guide.example

$nodeArgs = $args
node "$PSScriptRoot\smoke-test.js" @nodeArgs
exit $LASTEXITCODE
