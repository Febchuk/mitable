$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "=== Mitable Full Wipe ===" -ForegroundColor Cyan
Write-Host "This will delete ALL Mitable data from your computer."
Write-Host ""

$targets = @(
    "$env:APPDATA\@mitable",
    "$env:APPDATA\@mitable-dev",
    "$env:APPDATA\mitable",
    "$env:APPDATA\Mitable",
    "$env:USERPROFILE\Documents\Mitable",
    "$env:USERPROFILE\Documents\Mitable_Dev",
    "$env:TEMP\mitable-whisper",
    "$env:USERPROFILE\AppData\Local\mitable",
    "$env:USERPROFILE\AppData\Local\Mitable",
    "$env:USERPROFILE\AppData\Local\@mitable",
    "$env:USERPROFILE\AppData\Local\@mitable-dev"
)

$found = @()
foreach ($path in $targets) {
    if (Test-Path $path) {
        $found += $path
    }
}

if ($found.Count -eq 0) {
    Write-Host "Nothing to clean. No Mitable data found." -ForegroundColor Green
    exit 0
}

Write-Host "Found $($found.Count) location(s) to remove:" -ForegroundColor Yellow
foreach ($path in $found) {
    $size = (Get-ChildItem -Path $path -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    if ($size -gt 1GB) {
        $sizeStr = "{0:N1} GB" -f ($size / 1GB)
    } elseif ($size -gt 1MB) {
        $sizeStr = "{0:N0} MB" -f ($size / 1MB)
    } else {
        $sizeStr = "{0:N0} KB" -f ($size / 1KB)
    }
    Write-Host "  $path ($sizeStr)" -ForegroundColor Gray
}

Write-Host ""
$confirm = Read-Host "Type YES to confirm deletion"
if ($confirm -ne "YES") {
    Write-Host "Aborted." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Wiping..." -ForegroundColor Yellow
foreach ($path in $found) {
    try {
        Remove-Item -Path $path -Recurse -Force
        Write-Host "  Deleted: $path" -ForegroundColor Green
    } catch {
        Write-Host "  FAILED: $path" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Clearing OS keychain entries..." -ForegroundColor Yellow
try {
    cmdkey /list 2>&1 | Select-String "mitable" | ForEach-Object {
        $line = $_.ToString()
        if ($line -match "Target:\s*(.+)") {
            $target = $Matches[1].Trim()
            cmdkey /delete:$target 2>&1 | Out-Null
            Write-Host "  Cleared: $target" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  Keychain cleanup skipped" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Wipe complete ===" -ForegroundColor Cyan
Write-Host "Restart the app for a fresh start."
Write-Host ""
