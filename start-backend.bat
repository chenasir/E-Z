@echo off
title 实时听译 - 腾讯代理启动
echo.
echo ====================================
echo    启动腾讯翻译后端代理 (3001)
echo ====================================
echo.

rem 检查Node
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org/
  pause
  exit /b 1
)

rem 安装依赖（如首次运行）
if not exist "node_modules" (
  echo [信息] 首次启动，安装依赖...
  npm install --silent
)

echo [信息] 启动代理服务 http://localhost:3001
node backend-server.js


