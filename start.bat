@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server.py %* & goto :eof)
where python >nul 2>nul && (python server.py %* & goto :eof)
echo Khong tim thay Python. Cai Python 3 tai https://www.python.org/downloads/ (tick "Add python.exe to PATH").
pause
