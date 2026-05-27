# Find ISCC.exe and build the installer
$candidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "$([Environment]::GetFolderPath('ProgramFilesX86'))\Inno Setup 6\ISCC.exe",
    "C:\InnoSetup6\ISCC.exe",
    "C:\Inno Setup 6\ISCC.exe"
)

$iscc = $null
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $iscc = $c; break }
}

# Try registry
if (-not $iscc) {
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe"
    )
    foreach ($rp in $regPaths) {
        try {
            $v = (Get-ItemProperty $rp -ErrorAction SilentlyContinue).'(Default)'
            if ($v -and (Test-Path $v)) { $iscc = $v; break }
        } catch {}
    }
}

# Try PATH env
if (-not $iscc) {
    $inPath = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($inPath) { $iscc = $inPath.Source }
}

if (-not $iscc) {
    Write-Host "ISCC.exe not found! Provide the path as argument: .\find_and_build.ps1 'C:\path\to\ISCC.exe'" -ForegroundColor Red
    Write-Host "Or run: Get-ChildItem C:\ -Recurse -Filter ISCC.exe -ErrorAction SilentlyContinue" -ForegroundColor Yellow
    # Accept path as argument
    if ($args.Count -gt 0 -and (Test-Path $args[0])) { $iscc = $args[0] } else { exit 1 }
}

Write-Host "Found ISCC at: $iscc" -ForegroundColor Green

$issFile = Join-Path $PSScriptRoot "ImageGenerator.iss"
Write-Host "Compiling: $issFile"
& $iscc $issFile
if ($LASTEXITCODE -eq 0) {
    Write-Host "Setup built successfully!" -ForegroundColor Green
    Get-ChildItem (Join-Path $PSScriptRoot "Output") -Filter "*.exe" |
        Select-Object Name, @{n='Size(MB)';e={[math]::Round($_.Length/1MB,1)}}
} else {
    Write-Host "ISCC failed with exit $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
