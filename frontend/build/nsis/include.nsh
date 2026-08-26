; Tini Suite custom install hooks. One shared executable/runtime/model tree,
; exposed as two independent Windows product entries.
;
; Both shortcuts launch the same Tini Suite.exe, which on first run of either
; product spawns/attaches a shared "Tini Core" backend process (see
; frontend/electron/coreSupervisor.ts) that keeps running independently of
; any single window, tracked by state files under
; %APPDATA%\Tini Suite\core\ (session.json, startup.lock, clients\*.json).
; If an install/upgrade runs while that backend (or an old app window) is
; still alive, the running Tini Suite.exe can lock files the installer needs
; to overwrite, and — worse — a leftover Core process from the PREVIOUS
; version can keep listening on its port and get silently reattached to by
; the newly installed app (health checks only verify the port responds, not
; that it's serving this version), leaving the UI stuck on "Đang kết nối
; máy chủ..." after upgrade. customInit runs first, before any files are
; extracted, so terminate any running instance there; customInstall then
; clears the stale core state directory so the next launch always starts a
; fresh Core instead of reattaching to whatever the old version left behind.
!macro customInit
  nsProcess::_FindProcess "Tini Suite.exe"
  Pop $0
  IntCmp $0 0 0 tiniSuiteNotRunning tiniSuiteNotRunning
  nsProcess::_KillProcess "Tini Suite.exe"
  Pop $0
  Sleep 500
  tiniSuiteNotRunning:
  nsProcess::_Unload
!macroend

!macro customInstall
  RMDir /r "$APPDATA\Tini Suite\core"

  CreateDirectory "$SMPROGRAMS\Tini Suite"
  Delete "$SMPROGRAMS\Mark Tini.lnk"
  Delete "$SMPROGRAMS\Tini Suite.lnk"
  Delete "$DESKTOP\Mark Tini.lnk"
  Delete "$DESKTOP\Tini Suite.lnk"

  CreateShortcut "$SMPROGRAMS\Tini Suite\Mark Tini.lnk" "$INSTDIR\Tini Suite.exe" "--product=mark-tini" "$INSTDIR\resources\mark-tini.ico" 0 SW_SHOWNORMAL "" "Mark Tini - Document Studio"
  CreateShortcut "$SMPROGRAMS\Tini Suite\Tini OCR.lnk" "$INSTDIR\Tini Suite.exe" "--product=tini-ocr" "$INSTDIR\resources\tini-ocr.ico" 0 SW_SHOWNORMAL "" "Tini OCR - Image to Text & Word"
  CreateShortcut "$DESKTOP\Mark Tini.lnk" "$INSTDIR\Tini Suite.exe" "--product=mark-tini" "$INSTDIR\resources\mark-tini.ico" 0 SW_SHOWNORMAL "" "Mark Tini - Document Studio"
  CreateShortcut "$DESKTOP\Tini OCR.lnk" "$INSTDIR\Tini Suite.exe" "--product=tini-ocr" "$INSTDIR\resources\tini-ocr.ico" 0 SW_SHOWNORMAL "" "Tini OCR - Image to Text & Word"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Tini Suite\Mark Tini.lnk"
  Delete "$SMPROGRAMS\Tini Suite\Tini OCR.lnk"
  Delete "$DESKTOP\Mark Tini.lnk"
  Delete "$DESKTOP\Tini OCR.lnk"
  RMDir "$SMPROGRAMS\Tini Suite"
!macroend
