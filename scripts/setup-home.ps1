param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git was not found. Install Git for Windows first."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 18 or newer first."
}

$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 18) {
  throw "Node.js is too old. Install Node.js 18 or newer."
}

if ($EnvFile) {
  $resolvedEnv = Resolve-Path -LiteralPath $EnvFile
  Copy-Item -LiteralPath $resolvedEnv -Destination (Join-Path $RepoRoot ".env") -Force
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".env"))) {
  Write-Warning "The repository root is missing .env. Copy it from the private transfer package before starting."
}

npm install
node --check server.js
node --check public/app.js

Write-Host ""
Write-Host "Setup checks passed. Start with: npm start"
Write-Host "Open: http://localhost:5177"
