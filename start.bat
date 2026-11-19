@echo off
chcp 65001 >nul
title 川大教务处服务启动器

echo ======================================================
echo    DeepSeek Harness 四川大学教务系统 (URP) 本地服务
echo ======================================================
echo.

cd /d "%~dp0"

if exist "bin\scu-urp-service.exe" (
    echo [启动模式] 优先使用独立免安装单文件服务 (0 外部 Python 依赖)...
    echo 服务监听地址: http://127.0.0.1:48080
    echo 按 Ctrl+C 可停止服务
    echo.
    bin\scu-urp-service.exe
    goto end
)

cd /d "%~dp0server"

set "PY312=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if exist "%PY312%" (
    echo [启动模式] 使用本地 Python 3.12 解释器启动...
    "%PY312%" app.py
    goto end
)

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [启动模式] 使用 py -3.12 启动...
    py -3.12 app.py
    goto end
)

echo [启动模式] 使用系统默认 python 启动 (触发环境自愈)...
python app.py

:end
if %ERRORLEVEL% neq 0 (
    echo.
    echo 服务非正常退出，退出码: %ERRORLEVEL%
    pause
)
