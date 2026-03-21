; installer.nsh — Custom NSIS installer actions for Liquid Glass Bar
; Adds the app to Windows startup automatically after install.

!macro customInstall
  ; Add to Windows startup via registry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "LiquidGlassBar" "$INSTDIR\Liquid Glass Bar.exe"
  
  ; Note: app will start on next login automatically
!macroend

!macro customUnInstall
  ; Remove from Windows startup
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LiquidGlassBar"
!macroend
