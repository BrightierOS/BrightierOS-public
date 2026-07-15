@echo off
title BrightierOS
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "PORT=%PORT%"
if "%PORT%"=="" set "PORT=3000"
set "PIDFILE=data\bos.pid"
set "LOGFILE=logs\bos.log"
set "RESTART_FLAG=data\.bos-restart"
set "RESTART_CODE=65"

if /i "%~1"=="run" goto run_mode

:: ===== Console interativo (padrao) =====
if not exist node_modules ( echo Instalando dependencias... & call npm install )
call :auto_start

:menu_loop
call :maybe_auto_restart
cls
echo ==========================================
echo        BrightierOS — Console
echo ==========================================
if exist "%PIDFILE%" ( for /f %%p in (%PIDFILE%) do ( tasklist /fi "PID eq %%p" | find "PID" >nul && (echo  Estado: RODANDO (PID %%p)) || (echo  Estado: PARADO) ) ) else ( echo  Estado: PARADO )
echo ------------------------------------------
echo  [1] 🚀 Iniciar o BrightierOS
echo  [2] 🛑 Parar o sistema
echo  [3] 🔄 Reiniciar servicos
echo  [4] 📊 Status dos componentes
echo  [5] 🧪 Verificar dependencias
echo  [6] 📝 Gerenciar logs
echo  [7] ⚙️  Carregar configuracoes
echo  [8] 🔌 Controlar modulos/plugins
echo  [9] 🩺 Modo diagnostico
echo  [0] ⏻ Sair (o servidor continua em background)
echo ------------------------------------------
set /p "op=  Escolha: "
if "%op%"=="1" ( call :start_svc & goto pause_back )
if "%op%"=="2" ( call :stop_svc & goto pause_back )
if "%op%"=="3" ( call :restart_svc & goto pause_back )
if "%op%"=="4" ( node bOS-console.js status & goto pause_back )
if "%op%"=="5" ( call :deps & goto pause_back )
if "%op%"=="6" ( call :logs & goto pause_back )
if "%op%"=="7" ( node bOS-console.js config & goto pause_back )
if "%op%"=="8" ( call :plugins & goto pause_back )
if "%op%"=="9" ( node bOS-console.js diagnose & goto pause_back )
if "%op%"=="0" goto :eof
echo Opcao invalida.
echo.
pause
goto menu_loop
:pause_back
echo.
pause
goto menu_loop

:: ---------- subrotinas ----------
:auto_start
if not exist "%PIDFILE%" goto auto_start_now
for /f %%p in (%PIDFILE%) do ( tasklist /fi "PID eq %%p" | find "PID" >nul && goto :eof )
:auto_start_now
echo Iniciando BrightierOS automaticamente...
call :deps >nul 2>&1 || call npm install --production >> "%LOGFILE%" 2>&1
call :start_server
goto :eof

:maybe_auto_restart
if not exist "%RESTART_FLAG%" goto :eof
if exist "%PIDFILE%" ( for /f %%p in (%PIDFILE%) do ( tasklist /fi "PID eq %%p" | find "PID" >nul && goto :eof ) )
echo [bOS] Atualizacao pendente detectada. Reinstalando deps e reiniciando...
del /q "%RESTART_FLAG%" 2>nul
call :deps >nul 2>&1 || call npm install --production >> "%LOGFILE%" 2>&1
call :start_server
goto :eof

:start_server
if not exist logs mkdir logs
for /f %%i in ('powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%ROOT%' -RedirectStandardOutput '%LOGFILE%' -RedirectStandardError '%LOGFILE%.err' -PassThru ^| Select-Object -ExpandProperty Id"') do set "NPID=%%i"
echo %NPID%> "%PIDFILE%"
goto :eof

:stop_server
if not exist "%PIDFILE%" goto :eof
for /f %%p in (%PIDFILE%) do ( taskkill /pid %%p /t >nul 2>&1 )
del /q "%PIDFILE%" 2>nul
goto :eof

:start_svc
call :deps >nul 2>&1 || call npm install --production >> "%LOGFILE%" 2>&1
call :start_server
goto :eof

:restart_svc
call :stop_server
call :start_svc
goto :eof

:deps
echo Verificando dependencias...
if not exist node_modules ( echo   [X] node_modules ausente. & exit /b 1 )
npm ls --omit=dev --depth=0 >nul 2>&1 && ( echo   [OK] Dependencias OK. & exit /b 0 ) || ( echo   [!] Dependencias inconsistentes. & exit /b 1 )

:logs
echo === Logs (ultimas 50 linhas) ===
if exist "%LOGFILE%" ( powershell -NoProfile -Command "Get-Content -Tail 50 '%LOGFILE%'" ) else ( echo   (sem logs ainda) )
echo   [c] limpar  [v] voltar
set /p "sub=  escolha: "
if /i "%sub%"=="c" ( > "%LOGFILE%" echo. & echo   logs limpos. )
goto :eof

:plugins
echo === Modulos / Plugins ===
node bOS-console.js plugins
echo.
set /p "pid=  id para DESINSTALAR (ou Enter p/ voltar): "
if not "%pid%"=="" node bOS-console.js uninstall %pid%
goto :eof

:run_mode
if not exist node_modules ( echo Instalando dependencias... & call npm install )
if not exist logs mkdir logs
:run_loop
cls
echo ==========================================
echo        BrightierOS
echo ==========================================
echo Iniciando servidor (log: %LOGFILE%)...
echo Acesse: http://localhost:%PORT%
echo.
node server.js >> "%LOGFILE%" 2>&1
set "EXITCODE=%ERRORLEVEL%"
if "%EXITCODE%"=="%RESTART_CODE%" (
  echo [bOS] Atualizacao aplicada. Reinstalando deps e reiniciando...
  if exist "%RESTART_FLAG%" del /q "%RESTART_FLAG%"
  call npm install --production >> "%LOGFILE%" 2>&1
  timeout /t 2 /nobreak >nul
  goto run_loop
)
echo [bOS] Servidor encerrado (codigo %EXITCODE%).
pause
goto :eof
