@echo off
chcp 65001 >nul
title 川大教务处服务自检与启动器

echo ======================================================
echo    DeepSeek Harness 四川大学教务系统 (URP) 本地服务
echo ======================================================
echo.

cd /d "%~dp0server"

echo [1/2] 检查并安装 Python 依赖库...
pip install -r requirements.txt

echo.
echo [2/2] 启动本地 URP 桥接服务 (http://127.0.0.1:48080)...
python app.py

pause
