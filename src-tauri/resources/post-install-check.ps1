# Stemgen GUI — Post-Install Dependency Check
#
# Detects missing runtime dependencies (Python, FFmpeg) and offers
# one-click installation via winget/choco. Writes a JSON marker file
# read by FirstRunWizard.tsx to skip redundant in-app checks.
#
# Runs once via RunOnce registry key set by the NSIS installer.
# Safe to re-run — skips dependencies already installed.

param(
    [switch]$Silent
)

$ErrorActionPreference = 'Stop'

# ── Paths ────────────────────────────────────────────────────────────────────
$appDataDir = Join-Path $env:APPDATA 'stemgen-gui'
$markerFile = Join-Path $appDataDir 'installer_deps_checked.json'
$logFile    = Join-Path $env:TEMP 'stemgen-setup-deps.log'

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $Message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

# Ensure directories exist
if (-not (Test-Path $appDataDir)) {
    New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null
}

Write-Log "=== Stemgen GUI Post-Install Dependency Check ==="

# ── Detection helpers ────────────────────────────────────────────────────────

function Test-Python {
    foreach ($cmd in @('python', 'py', 'python3')) {
        $exe = Get-Command $cmd -ErrorAction SilentlyContinue
        if ($exe) {
            try {
                $ver = & $cmd --version 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "Python found: $ver via $cmd ($($exe.Source))"
                    return $true
                }
            } catch {}
        }
    }
    Write-Log "Python NOT found"
    return $false
}

function Test-FFmpeg {
    $exe = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($exe) {
        try {
            $ver = & ffmpeg -version 2>&1 | Select-Object -First 1
            Write-Log "FFmpeg found: $ver ($($exe.Source))"
            return $true
        } catch {}
    }
    Write-Log "FFmpeg NOT found"
    return $false
}

function Test-Winget {
    $exe = Get-Command winget -ErrorAction SilentlyContinue
    if ($exe) {
        Write-Log "winget available: $($exe.Source)"
        return $true
    }
    Write-Log "winget NOT available"
    return $false
}

function Test-Choco {
    $exe = Get-Command choco -ErrorAction SilentlyContinue
    if ($exe) {
        Write-Log "choco available: $($exe.Source)"
        return $true
    }
    Write-Log "choco NOT available"
    return $false
}

function Install-Package {
    param(
        [string]$DisplayName,
        [string]$WingetId,
        [string]$ChocoId
    )

    $winget = Test-Winget
    $choco  = Test-Choco

    if ($winget) {
        Write-Log "Installing $DisplayName via winget ($WingetId)..."
        try {
            $proc = Start-Process -FilePath 'winget' -ArgumentList @(
                'install', '--id', $WingetId,
                '--silent',
                '--accept-package-agreements',
                '--accept-source-agreements'
            ) -Wait -PassThru -NoNewWindow
            if ($proc.ExitCode -eq 0) {
                Write-Log "$DisplayName installed successfully via winget"
                return $true
            }
            Write-Log "winget install failed with exit code $($proc.ExitCode)"
        } catch {
            Write-Log "winget install error: $_"
        }
    }

    if ($choco) {
        Write-Log "Installing $DisplayName via choco ($ChocoId)..."
        try {
            $proc = Start-Process -FilePath 'choco' -ArgumentList @(
                'install', $ChocoId, '-y'
            ) -Wait -PassThru -NoNewWindow
            if ($proc.ExitCode -eq 0) {
                Write-Log "$DisplayName installed successfully via choco"
                return $true
            }
            Write-Log "choco install failed with exit code $($proc.ExitCode)"
        } catch {
            Write-Log "choco install error: $_"
        }
    }

    Write-Log "No package manager available to install $DisplayName"
    return $false
}

# ── Main logic ───────────────────────────────────────────────────────────────

$pythonOk = Test-Python
$ffmpegOk = Test-FFmpeg
$allOk    = $pythonOk -and $ffmpegOk

# If everything is already installed, write marker and exit
if ($allOk -and $Silent) {
    Write-Log "All dependencies present (silent mode). Writing marker and exiting."
    $marker = @{
        python  = $true
        ffmpeg  = $true
        pytorch = $true  # deferred to FirstRunWizard
        demucs  = $true  # deferred to FirstRunWizard
        timestamp     = (Get-Date).ToUniversalTime().ToString('o')
        installer_version = '1.4.2'
    }
    $marker | ConvertTo-Json -Depth 3 | Set-Content -Path $markerFile -Encoding UTF8
    exit 0
}

if ($allOk) {
    Write-Log "All dependencies present. Nothing to do."
} else {
    Write-Log "Missing dependencies detected."
}

# ── Interactive mode ─────────────────────────────────────────────────────────
if (-not $Silent -and -not $allOk) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form            = New-Object System.Windows.Forms.Form
    $form.Text       = 'Stemgen GUI — Dependency Check'
    $form.Size       = New-Object System.Drawing.Size(480, 340)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false

    # Title
    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Text      = 'Runtime Dependencies'
    $lblTitle.Font      = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
    $lblTitle.Location  = New-Object System.Drawing.Point(20, 15)
    $lblTitle.Size      = New-Object System.Drawing.Size(440, 30)
    $form.Controls.Add($lblTitle)

    # Python status
    $lblPython = New-Object System.Windows.Forms.Label
    $lblPython.Text     = if ($pythonOk) { "Python: Installed" } else { "Python: Not found" }
    $lblPython.ForeColor = if ($pythonOk) { [System.Drawing.Color]::Green } else { [System.Drawing.Color]::Red }
    $lblPython.Location = New-Object System.Drawing.Point(40, 60)
    $lblPython.Size     = New-Object System.Drawing.Size(300, 20)
    $form.Controls.Add($lblPython)

    # FFmpeg status
    $lblFFmpeg = New-Object System.Windows.Forms.Label
    $lblFFmpeg.Text     = if ($ffmpegOk) { "FFmpeg: Installed" } else { "FFmpeg: Not found" }
    $lblFFmpeg.ForeColor = if ($ffmpegOk) { [System.Drawing.Color]::Green } else { [System.Drawing.Color]::Red }
    $lblFFmpeg.Location = New-Object System.Drawing.Point(40, 90)
    $lblFFmpeg.Size     = New-Object System.Drawing.Size(300, 20)
    $form.Controls.Add($lblFFmpeg)

    # Checkboxes for missing deps
    $chkPython = New-Object System.Windows.Forms.CheckBox
    $chkPython.Text     = 'Install Python 3.12'
    $chkPython.Location = New-Object System.Drawing.Point(40, 130)
    $chkPython.Size     = New-Object System.Drawing.Size(300, 20)
    $chkPython.Checked  = -not $pythonOk
    $chkPython.Enabled  = -not $pythonOk
    $form.Controls.Add($chkPython)

    $chkFFmpeg = New-Object System.Windows.Forms.CheckBox
    $chkFFmpeg.Text     = 'Install FFmpeg'
    $chkFFmpeg.Location = New-Object System.Drawing.Point(40, 160)
    $chkFFmpeg.Size     = New-Object System.Drawing.Size(300, 20)
    $chkFFmpeg.Checked  = -not $ffmpegOk
    $chkFFmpeg.Enabled  = -not $ffmpegOk
    $form.Controls.Add($chkFFmpeg)

    # Install button
    $btnInstall = New-Object System.Windows.Forms.Button
    $btnInstall.Text     = 'Install Missing'
    $btnInstall.Location = New-Object System.Drawing.Point(40, 210)
    $btnInstall.Size     = New-Object System.Drawing.Size(140, 35)
    $btnInstall.Enabled  = (-not $pythonOk) -or (-not $ffmpegOk)
    $form.Controls.Add($btnInstall)

    # Skip button
    $btnSkip = New-Object System.Windows.Forms.Button
    $btnSkip.Text     = 'Skip for Now'
    $btnSkip.Location = New-Object System.Drawing.Point(200, 210)
    $btnSkip.Size     = New-Object System.Drawing.Size(120, 35)
    $form.Controls.Add($btnSkip)

    # Status label
    $lblStatus = New-Object System.Windows.Forms.Label
    $lblStatus.Text     = ''
    $lblStatus.Location = New-Object System.Drawing.Point(40, 260)
    $lblStatus.Size     = New-Object System.Drawing.Size(400, 40)
    $form.Controls.Add($lblStatus)

    $btnSkip.Add_Click({
        Write-Log "User clicked 'Skip for Now'"
        $form.Close()
    })

    $btnInstall.Add_Click({
        $btnInstall.Enabled = $false
        $btnSkip.Enabled    = $false

        if ($chkPython.Checked -and -not $pythonOk) {
            $lblStatus.Text = 'Installing Python...'
            $form.Refresh()
            $ok = Install-Package -DisplayName 'Python' -WingetId 'Python.Python.3.12' -ChocoId 'python3'
            if ($ok) {
                $pythonOk = $true
                $lblPython.Text      = 'Python: Installed'
                $lblPython.ForeColor = [System.Drawing.Color]::Green
                $chkPython.Checked   = $false
            }
        }

        if ($chkFFmpeg.Checked -and -not $ffmpegOk) {
            $lblStatus.Text = 'Installing FFmpeg...'
            $form.Refresh()
            $ok = Install-Package -DisplayName 'FFmpeg' -WingetId 'FFmpeg.FFmpeg' -ChocoId 'ffmpeg'
            if ($ok) {
                $ffmpegOk = $true
                $lblFFmpeg.Text      = 'FFmpeg: Installed'
                $lblFFmpeg.ForeColor = [System.Drawing.Color]::Green
                $chkFFmpeg.Checked   = $false
            }
        }

        $allInstalled = $pythonOk -and $ffmpegOk
        if ($allInstalled) {
            $lblStatus.Text      = 'All dependencies installed!'
            $lblStatus.ForeColor = [System.Drawing.Color]::Green
        } else {
            $lblStatus.Text = 'Some dependencies could not be installed. You can install them manually later.'
            $lblStatus.ForeColor = [System.Drawing.Color]::OrangeRed
        }

        $btnSkip.Text       = 'Close'
        $btnSkip.Enabled    = $true
        $btnInstall.Enabled = (-not $pythonOk) -or (-not $ffmpegOk)
    })

    [void]$form.ShowDialog()
}

# ── Write marker file ────────────────────────────────────────────────────────
$marker = @{
    python  = $pythonOk
    ffmpeg  = $ffmpegOk
    pytorch = $true   # deferred to FirstRunWizard
    demucs  = $true   # deferred to FirstRunWizard
    timestamp         = (Get-Date).ToUniversalTime().ToString('o')
    installer_version = '1.4.2'
}
$marker | ConvertTo-Json -Depth 3 | Set-Content -Path $markerFile -Encoding UTF8

Write-Log "Marker file written to: $markerFile"
Write-Log "=== Dependency check complete ==="
