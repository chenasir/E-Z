#!/bin/bash

echo "====================================="
echo "  启动腾讯翻译后端代理 (3001)"
echo "====================================="

if ! command -v node &>/dev/null; then
  echo "[错误] 未检测到 Node.js，请先安装: https://nodejs.org/"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[信息] 首次启动，安装依赖..."
  npm install --silent
fi

echo "[信息] 启动代理服务 http://localhost:3001"
node backend-server.js


