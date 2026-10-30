; Omkreds og Omkreds FEM — NSIS-hooks til installationsprogrammerne.
;
; Beregningsdelen (backend\omkreds-backend.exe) er et selvstændigt program, som
; skallen starter. Kører den stadig fra en tidligere version -- fordi programmet
; er åbent, eller fordi skallen gik ned uden at stoppe den -- er dens filer
; låst, og installationen stopper med "Fejl ved skrivning af fil ...
; _imaging.cp311-win_amd64.pyd". Tauris egen kontrol ser kun efter
; programmets egen .exe, så beregningsdelen lukkes her, før filerne kopieres.
;
; Begge programmer har en omkreds-backend.exe. Kun den, der kører fra denne
; installations mappe, lukkes: at opdatere Omkreds FEM må ikke lukke Omkreds
; midt i arbejdet, og omvendt.

!macro OMKREDS_STOP_BACKEND
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -Name omkreds-backend -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
  Pop $0
  ; Windows frigiver filerne et øjeblik efter, at processen er stoppet.
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro OMKREDS_STOP_BACKEND
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro OMKREDS_STOP_BACKEND
!macroend
