; NSIS installer hooks for Stemgen GUI
;
; This file is referenced by tauri.conf.json > bundle.windows.nsis.installerHooks.
; Tauri invokes these macros at the appropriate stage of the NSIS installer.

!macro NSIS_HOOK_POSTINSTALL
  ; Register a RunOnce key to run the post-install dependency check script
  ; once on next login. The script detects Python/FFmpeg and offers auto-install.
  ; It writes a JSON marker file read by FirstRunWizard.tsx to skip redundant checks.

  ; Resolve the resource directory (where the bundled script lives)
  ; $INSTDIR is the installation directory set by the Tauri NSIS installer
  StrCpy $0 "$INSTDIR\post-install-check.ps1"

  ; Only register if the script exists in the installed files
  IfFileExists "$0" 0 done

  ; Write RunOnce registry key (HKCU so no elevation needed)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\RunOnce" \
    "StemgenDepCheck" \
    'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "$0"'

  ; Also log to a temp file for debugging
  FileOpen $1 "$TEMP\stemgen-setup-deps.log" a
  FileWrite $1 "RunOnce key registered for: $0$\r$\n"
  FileClose $1

  done:
!macroend
