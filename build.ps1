# Offline packaging: copy Electron runtime + bundle app (no network)
$ErrorActionPreference = "Stop"
$root = "F:\workspace\lanerc\pc"
$out  = Join-Path $root "dist\mikufun"
$rt   = Join-Path $root "node_modules\electron\dist"

if (-not (Test-Path (Join-Path $rt "electron.exe"))) { throw "electron runtime missing" }

# 0) syntax gate: 绝不打包带语法错误的代码（app.js 顶层错误会导致界面只剩侧边栏）
Write-Host "checking syntax..."
$checkFiles = @("main.js","preload.js","worker.js","host.js","maccms.js","xifan.js","generic.js","cycani.js","renderer\app.js")
foreach ($f in $checkFiles) {
  node --check (Join-Path $root $f) 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "syntax error in $f - abort build" }
}
Write-Host "syntax ok"

# 1) clean
if (Test-Path (Join-Path $root "dist")) { Remove-Item (Join-Path $root "dist") -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null

# 2) copy runtime
Write-Host "copying runtime..."
Copy-Item (Join-Path $rt "*") $out -Recurse -Force

# 3) rename exe
$exe = Join-Path $out "electron.exe"
if (Test-Path $exe) { Move-Item $exe (Join-Path $out "mikufun.exe") -Force }

# 4) bundle app into resources\app
$app = Join-Path $out "resources\app"
New-Item -ItemType Directory -Force -Path $app | Out-Null
$files = @("main.js","preload.js","worker.js","host.js","package.json","maccms.js","xifan.js","generic.js","cycani.js")
foreach ($f in $files) { Copy-Item (Join-Path $root $f) (Join-Path $app $f) -Force }
foreach ($d in @("sources","renderer")) {
  Copy-Item (Join-Path $root $d) (Join-Path $app $d) -Recurse -Force
}

# 5) slim package.json (single-line JSON, avoid here-string pitfalls)
$pkgJson = '{"name":"mikufun","productName":"mikufun","version":"1.0.4","description":"mikufun · 动漫桌面客户端（本地源引擎）","main":"main.js","author":"local","license":"MIT"}'
[System.IO.File]::WriteAllText((Join-Path $app "package.json"), $pkgJson, (New-Object System.Text.UTF8Encoding $false))

# 6) remove default app
$defaultApp = Join-Path $out "resources\default_app.asar"
if (Test-Path $defaultApp) { Remove-Item $defaultApp -Force }

# 7) icon (rcedit if available)
$rcedit = Join-Path $root "node_modules\.bin\rcedit.cmd"
$ico = Join-Path $root "assets\icon.ico"
if (Test-Path $rcedit) {
  try {
    & $rcedit (Join-Path $out "mikufun.exe") --set-icon $ico 2>&1 | Out-Null
    Write-Host "icon applied"
  } catch { Write-Host "icon apply failed: $_" }
}

$exePath = Join-Path $out "mikufun.exe"
$size = [Math]::Round((Get-Item $exePath).Length / 1MB, 1)
Write-Host "DONE: $exePath ($size MB)"
Get-ChildItem $out | Select-Object Name,Length | Format-Table -AutoSize
