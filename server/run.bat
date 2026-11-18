@echo off
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" app.py
) else (
    py -3.12 app.py
)
