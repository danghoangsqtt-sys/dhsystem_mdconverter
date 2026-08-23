; Tini Suite custom install hooks. One shared executable/runtime/model tree,
; exposed as two independent Windows product entries.
!macro customInstall
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
