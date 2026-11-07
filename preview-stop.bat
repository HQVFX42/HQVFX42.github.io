@echo off
cd /d "%~dp0"
python tools\preview.py --stop %*
if errorlevel 1 pause
