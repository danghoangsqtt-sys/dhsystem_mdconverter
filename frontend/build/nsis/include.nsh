; Remove shortcuts left by the retired multi-product installer.
; This macro deliberately uses only NSIS built-ins: no process management,
; no custom shortcut creation, and no dependency on external NSIS plugins.
!macro customInstall
  Delete "$DESKTOP\Tini OCR.lnk"
  Delete "$DESKTOP\Tini Suite.lnk"
  Delete "$SMPROGRAMS\Tini Suite\Tini OCR.lnk"
  Delete "$SMPROGRAMS\Tini Suite\Mark Tini.lnk"
  RMDir "$SMPROGRAMS\Tini Suite"
!macroend
