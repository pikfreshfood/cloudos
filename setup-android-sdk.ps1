# ==============================================================================
# Android SDK Command-Line Installation Script (No Android Studio Required)
# ==============================================================================
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = "Stop"

Write-Host "1. Installing Java 17 (Required for React Native/Expo)..." -ForegroundColor Cyan
winget install Microsoft.OpenJDK.17 -e --accept-package-agreements --accept-source-agreements
# Refresh path for current session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "`n2. Setting up Android SDK directories..." -ForegroundColor Cyan
$AndroidHome = "$env:LOCALAPPDATA\Android\Sdk"
$CmdLineToolsPath = "$AndroidHome\cmdline-tools"
$LatestCmdLinePath = "$CmdLineToolsPath\latest"

If (-not (Test-Path $LatestCmdLinePath)) {
    New-Item -ItemType Directory -Force -Path $CmdLineToolsPath | Out-Null
    
    Write-Host "Downloading Android Command-Line Tools..." -ForegroundColor Yellow
    $ZipPath = "$env:TEMP\cmdline-tools.zip"
    # This is the official Google download link for Windows Command-Line Tools
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip" -OutFile $ZipPath
    
    Write-Host "Extracting..." -ForegroundColor Yellow
    Expand-Archive -Path $ZipPath -DestinationPath $CmdLineToolsPath -Force
    
    # Google's zip extracts to a folder named 'cmdline-tools'. 
    # It must be renamed to 'latest' to work properly.
    Rename-Item -Path "$CmdLineToolsPath\cmdline-tools" -NewName "latest"
    Remove-Item -Path $ZipPath -Force
}

Write-Host "`n3. Setting Environment Variables permanently..." -ForegroundColor Cyan
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $AndroidHome, "User")
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$NewPaths = @(
    "$AndroidHome\cmdline-tools\latest\bin",
    "$AndroidHome\platform-tools",
    "$AndroidHome\emulator"
)
foreach ($p in $NewPaths) {
    if ($UserPath -notmatch [regex]::Escape($p)) {
        $UserPath += ";$p"
    }
}
[Environment]::SetEnvironmentVariable("Path", $UserPath, "User")
# Update current session
$env:ANDROID_HOME = $AndroidHome
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + $UserPath

Write-Host "`n4. Accepting Android SDK Licenses and Installing Build Tools..." -ForegroundColor Cyan
# Automatically accept licenses
$SdkManager = "$LatestCmdLinePath\bin\sdkmanager.bat"
$ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
$ProcessInfo.FileName = "cmd.exe"
$ProcessInfo.Arguments = "/c echo y| `"$SdkManager`" --licenses"
$ProcessInfo.RedirectStandardOutput = $true
$ProcessInfo.UseShellExecute = $false
$Process = [System.Diagnostics.Process]::Start($ProcessInfo)
$Process.WaitForExit()

Write-Host "Installing Platform-Tools, Build-Tools, and Android API 34..." -ForegroundColor Yellow
& $SdkManager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host "SUCCESS: Android SDK has been installed without Android Studio!" -ForegroundColor Green
Write-Host "IMPORTANT: You MUST close this terminal and open a new one for changes to apply." -ForegroundColor Green
Write-Host "After opening a new terminal, run: npx expo run:android" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Green
