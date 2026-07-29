@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Actualizar la app de XRP

echo.
echo ============================================================
echo   ACTUALIZAR LA APP DE XRP
echo ============================================================
echo.
echo   Si cambiaste alguna REGLA del sistema, recuerda que hay
echo   que tocarla en los DOS sitios o app y bot se contradicen:
echo.
echo     1) xrp-signal-bot\engine\signal.py   (el bot)
echo     2) XRP-App\src\engine\signal.ts      (la app)
echo.
echo   Los PARAMETROS (riesgo, stops, umbrales) NO se tocan aqui:
echo   se editan en la pestana Ajustes de la app y se sincronizan.
echo.
pause
echo.

rem Localiza Python sin depender del PATH: si esta ventana heredo un PATH viejo,
rem "python" no se reconoce aunque este perfectamente instalado.
set "PY="
for %%p in (python.exe) do if not defined PY if not "%%~$PATH:p"=="" set "PY=%%~$PATH:p"
if not defined PY for %%p in (py.exe) do if not "%%~$PATH:p"=="" set "PY=%%~$PATH:p"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
if not defined PY (
  for /d %%d in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%d\python.exe" set "PY=%%d\python.exe"
  )
)
if not defined PY goto :error_sin_python
echo   Python: !PY!
echo.

echo [1/3] Comprobando PARIDAD con el motor del bot...
"!PY!" tools\paridad\capturar.py
if errorlevel 1 goto :error_captura
call npx tsx tools\paridad\comparar.ts
if errorlevel 1 goto :error_paridad
echo.

echo [2/3] Comprobando que compila...
call npx tsc --noEmit
if errorlevel 1 goto :error_tipos
echo   OK.
echo.

git diff --quiet && git diff --cached --quiet
if not errorlevel 1 (
  echo   No hay nada que subir. Todo esta ya en GitHub.
  echo.
  goto :fin
)

set "msg="
set /p msg=  Describe el cambio (Enter para uno generico):
if "!msg!"=="" set "msg=Actualizar la app"

echo.
echo [3/3] Subiendo a GitHub...
git add -A
git commit -m "!msg!"
if errorlevel 1 goto :error_commit
git push
if errorlevel 1 goto :error_push

echo.
echo ============================================================
echo   LISTO. GitHub ya esta compilando el APK.
echo ============================================================
echo.
echo   Ahora, en el movil o el navegador:
echo.
echo     1. Abre  github.com/orequeto92/APKXrp/actions
echo     2. Espera a que la ejecucion se ponga verde (~4 min)
echo     3. Entra en ella y descarga  Artifacts ^> xrp-apk
echo     4. Descomprime e instala el .apk ENCIMA del anterior
echo.
echo   El saldo y el historial se conservan al reinstalar encima.
echo.
goto :fin

:error_sin_python
echo.
echo   ERROR: no encuentro Python. Instalalo desde python.org
echo   marcando "Add python.exe to PATH".
goto :fin

:error_captura
echo.
echo   ERROR capturando los datos del motor Python.
echo   Revisa que exista  C:\Users\Brahian\xrp-signal-bot
goto :fin

:error_paridad
echo.
echo   ERROR DE PARIDAD: la app y el bot NO deciden igual.
echo   NO subas esto: revisa signal.ts contra signal.py.
goto :fin

:error_tipos
echo.
echo   ERROR de tipos en TypeScript. Revisa el mensaje de arriba.
goto :fin

:error_commit
echo.
echo   ERROR al hacer commit.
goto :fin

:error_push
echo.
echo   ERROR al subir. Revisa tu conexion y credenciales de GitHub.
goto :fin

:fin
echo.
pause
endlocal
