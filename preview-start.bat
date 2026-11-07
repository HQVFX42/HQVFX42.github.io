@echo off
cd /d "%~dp0"
python tools\preview.py %*
if errorlevel 1 pause
