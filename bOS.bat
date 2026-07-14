@echo off

title BrightierOS

echo.
echo ==========================
echo       BrightierOS
echo ==========================
echo.

echo Iniciando servidor...

cd /d "%~dp0"


if not exist node_modules (
    echo Instalando dependencias...
    npm install
)


echo.
echo BrightierOS iniciado!
echo Acesse:
echo http://localhost:3000
echo.


node server.js


pause