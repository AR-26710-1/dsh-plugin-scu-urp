@echo off
chcp 65001 >nul
title 四川大学宿舍电费查询测试

echo 正在启动四川大学电费查询脚本...
echo.

py -3.12 scu_ele_test.py

echo.
pause
