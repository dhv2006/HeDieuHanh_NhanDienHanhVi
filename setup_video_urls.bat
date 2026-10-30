@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py -3 tools\install_video_urls.py & goto :done)
where python >nul 2>nul && (python tools\install_video_urls.py & goto :done)
echo Khong tim thay Python 3. Cai tu https://www.python.org/downloads/
:done
pause
