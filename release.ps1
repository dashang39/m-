# 一键发版：自动升版本号 → 构建 → 同步用户副本 → 生成安装包
# 用法：.\release.ps1            自动 PATCH+1（1.0.3 -> 1.0.4）
#       .\release.ps1 -Version 1.1.0   指定版本
#       .\release.ps1 -NoBuild        只升版本，不构建
param(
  [string]$Version,
  [switch]$NoBuild,
  [string]$UserCopy = "F:\新建文件夹\mikufun"
)

$ErrorActionPreference = "Stop"
$root = "F:\workspace\lanerc\pc"
$env:ELECTRON_RUN_AS_NODE = $null
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# ---------- 1) 计算新版本 ----------
$pkgPath = Join-Path $root "package.json"
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cur = $pkg.version
if (-not $Version) {
  $parts = $cur.Split('.')
  $parts[2] = [string]([int]$parts[2] + 1)
  $Version = $parts -join '.'
}
Write-Host "版本：$cur -> $Version" -ForegroundColor Cyan

# ---------- 2) 更新各处版本号 ----------
# package.json
$pkg.version = $Version
[System.IO.File]::WriteAllText($pkgPath, ($pkg | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding $false))

# build.ps1 内嵌的 app/package.json
$bp = Join-Path $root "build.ps1"
$bt = [System.IO.File]::ReadAllText($bp, [System.Text.Encoding]::UTF8)
$bt = [regex]::Replace($bt, '"version":"[\d\.]+"', '"version":"' + $Version + '"')
[System.IO.File]::WriteAllText($bp, $bt, (New-Object System.Text.UTF8Encoding $true))

# renderer/app.js：公告版本 + 设置页版本文本
$ap = Join-Path $root "renderer\app.js"
$at = [System.IO.File]::ReadAllText($ap, [System.Text.Encoding]::UTF8)
$at = [regex]::Replace($at, "const NOTICE_VERSION = '[\d\.]+';", "const NOTICE_VERSION = '$Version';")
$at = [regex]::Replace($at, 'M记 [\d\.]+ · 本地源引擎', "M记 $Version · 本地源引擎")
[System.IO.File]::WriteAllText($ap, $at, (New-Object System.Text.UTF8Encoding $false))

Write-Host "已更新 package.json / build.ps1 / app.js" -ForegroundColor Green

if ($NoBuild) { exit 0 }

# ---------- 3) 构建便携版 ----------
Get-Process "mikufun", "M记" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Write-Host "构建中..." -ForegroundColor Yellow
& (Join-Path $root "build.ps1") 2>&1 | Select-String -Pattern "syntax|DONE" | ForEach-Object { Write-Host "  $($_.Line)" }

$dist = Join-Path $root "dist\mikufun"
& (Join-Path $root "set-icon.ps1") -Exe (Join-Path $dist "mikufun.exe") -Ico (Join-Path $root "assets\icon.ico") 2>&1 | Select-Object -Last 1

# ---------- 4) 同步到用户副本 ----------
if (Test-Path $UserCopy) {
  Get-Process "mikufun" -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
  $bak = "$UserCopy.bak-" + (Get-Date -Format 'HHmmss')
  Copy-Item $UserCopy $bak -Recurse -Force -ErrorAction SilentlyContinue
  robocopy $dist $UserCopy /MIR /NFL /NDL /NJH /NJS /NP 2>&1 | Out-Null
  Write-Host "已同步到用户副本（备份：$bak）" -ForegroundColor Green
}

# ---------- 5) 生成安装包 ----------
Write-Host "生成安装包..." -ForegroundColor Yellow
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
Push-Location $root
try {
  npx electron-builder --win nsis --x64 --prepackaged $dist --config electron-builder.yml 2>&1 |
    Select-String -Pattern "building|error" | ForEach-Object { Write-Host "  $($_.Line)" }
} finally { Pop-Location }

$setup = "F:\M记安装包\mikufun-Setup-$Version.exe"
if (Test-Path $setup) {
  $mb = [math]::Round((Get-Item $setup).Length / 1MB, 1)
  Write-Host ""
  Write-Host "完成：$setup ($mb MB)" -ForegroundColor Cyan
} else {
  Write-Host "安装包未生成，请检查 electron-builder 输出" -ForegroundColor Red
}
