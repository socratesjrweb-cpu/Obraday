@echo off
title Obraday - localhost:4700
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] O Node.js nao esta instalado neste computador.
  echo  Baixe a versao LTS em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo.
echo  Iniciando o Obraday em http://localhost:4700
echo  Deixe esta janela aberta. Para desligar, feche a janela ou aperte Ctrl+C.
echo.
node server.js
echo.
echo  O servidor parou.
pause
