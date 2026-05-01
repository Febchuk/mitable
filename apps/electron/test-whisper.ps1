## test-whisper.ps1
## Records 30 seconds of system audio via ffmpeg, then transcribes with whisper-cli.exe
## Output: Desktop\whisper-test-output.txt
##
## Prerequisites: ffmpeg in PATH (winget install ffmpeg if needed)

$duration = 30
$wavFile = "$env:TEMP\whisper-test-capture.wav"
$cliExe  = "$PSScriptRoot\bin\whisper-cpp\Release\whisper-cli.exe"
$model   = "$PSScriptRoot\bin\whisper-cpp\models\ggml-medium.en.bin"
$output  = "$env:USERPROFILE\Desktop\whisper-test-output.txt"

Write-Host ""
Write-Host "=== Whisper CLI Test ==="
Write-Host "CLI:    $cliExe"
Write-Host "Model:  $model"
Write-Host "WAV:    $wavFile"
Write-Host "Output: $output"
Write-Host ""

# Check prerequisites
if (!(Test-Path $cliExe)) { Write-Host "ERROR: whisper-cli.exe not found at $cliExe"; exit 1 }
if (!(Test-Path $model))  { Write-Host "ERROR: model not found at $model"; exit 1 }

# Check for ffmpeg
$ffmpegPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (!$ffmpegPath) { Write-Host "ERROR: ffmpeg not in PATH. Install with: winget install ffmpeg"; exit 1 }

Write-Host "Recording ${duration}s of system audio (stereo mix / loopback)..."
Write-Host "  -> Play your video, speak, do your thing."
Write-Host "  -> Recording starts NOW."
Write-Host ""

# Record from the default audio device (virtual audio cable / stereo mix)
# -f dshow -i audio="Stereo Mix" captures system audio on most Windows PCs
# If that fails, we fall back to the default input device
$devices = & ffmpeg -list_devices true -f dshow -i dummy 2>&1 | Out-String

# Try to find a loopback/stereo mix device
$loopbackDevice = $null
foreach ($line in ($devices -split "`n")) {
    if ($line -match '"(Stereo Mix.*?)"' -or $line -match '"(CABLE Output.*?)"' -or $line -match '"(What U Hear.*?)"') {
        $loopbackDevice = $Matches[1]
        break
    }
}

if ($loopbackDevice) {
    Write-Host "Found loopback device: $loopbackDevice"
    & ffmpeg -f dshow -i "audio=$loopbackDevice" -t $duration -ar 16000 -ac 1 -acodec pcm_s16le -y $wavFile 2>&1 | Out-Null
} else {
    Write-Host "No loopback device found. Using default microphone instead."
    Write-Host "(To capture system audio, enable 'Stereo Mix' in Sound settings > Recording devices)"
    & ffmpeg -f dshow -i "audio=@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\wave_{00000000-0000-0000-0000-000000000000}" -t $duration -ar 16000 -ac 1 -acodec pcm_s16le -y $wavFile 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Default device failed too. Listing available audio devices:"
        & ffmpeg -list_devices true -f dshow -i dummy 2>&1 | Select-String "audio"
        Write-Host ""
        Write-Host "Pick one and edit this script, or enable Stereo Mix in Windows Sound settings."
        exit 1
    }
}

if (!(Test-Path $wavFile)) {
    Write-Host "ERROR: WAV file was not created. Recording failed."
    exit 1
}

$fileSize = (Get-Item $wavFile).Length
Write-Host ""
Write-Host "Recording done! WAV size: $([math]::Round($fileSize / 1KB)) KB"
Write-Host ""
Write-Host "Running whisper-cli (medium.en model)..."
Write-Host "This may take 10-30 seconds on CPU..."
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$result = & $cliExe -m $model -f $wavFile --no-timestamps -t 4 -l en 2>&1
$sw.Stop()

$transcript = ($result | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -and -not $_.StartsWith("[") -and -not $_.StartsWith("whisper_") -and -not $_.StartsWith("system_info") }) -join " "

Write-Host "=== TRANSCRIPT (${($sw.Elapsed.TotalSeconds.ToString('F1'))}s) ==="
Write-Host $transcript
Write-Host "=== END ==="
Write-Host ""

# Write to file
@"
Whisper CLI Test - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Duration: ${duration}s
Model: ggml-medium.en
Time: $($sw.Elapsed.TotalSeconds.ToString('F1'))s

--- TRANSCRIPT ---
$transcript
--- END ---

--- RAW OUTPUT ---
$($result -join "`n")
--- END RAW ---
"@ | Set-Content -Path $output -Encoding UTF8

Write-Host "Transcript saved to: $output"
Write-Host "Done!"

# Cleanup
Remove-Item $wavFile -ErrorAction SilentlyContinue
