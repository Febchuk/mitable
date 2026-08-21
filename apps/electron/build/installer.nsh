!macro customInit
  ; Kill running Mitable process before install/upgrade
  nsExec::ExecToLog 'taskkill /F /IM "Mitable.exe" /T'
  Sleep 1000
!macroend

!macro customUnInit
  ; Kill running Mitable process before uninstall
  nsExec::ExecToLog 'taskkill /F /IM "Mitable.exe" /T'
  Sleep 1000
!macroend
