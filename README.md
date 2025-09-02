# 实时听译（英文→中文）

轻量网页应用：使用浏览器麦克风实时识别英文语音，并即时翻译为中文。支持 DeepSeek 与 腾讯翻译 两种 API。

## 功能
- 实时英文识别（Web Speech API，连续模式）
- 实时中文翻译（去抖与最小段落触发）
- 引擎切换：DeepSeek（前端直连）/ 腾讯翻译（本地代理）
- 简洁 UI，桌面/移动端适配

## 目录结构
openpi/real-time-translator/
- index.html
- style.css
- js/app.js
- backend-server.js
- start-backend.bat (Windows)
- start-backend.sh (macOS/Linux)
- package.json
- README.md

## 使用方法

### 方式A：DeepSeek（推荐）
1. 直接用浏览器打开 `index.html`
2. 右上选择“DeepSeek”，填入 `sk-...` API Key
3. 点击“开始识别”，开始实时听译

> DeepSeek 在前端直接走 HTTPS，请妥善保管 API Key。

### 方式B：腾讯翻译
1. 先启动本地代理（Node.js 14+）：
   - Windows：双击 `start-backend.bat`
   - macOS/Linux：`bash start-backend.sh`
2. 打开 `index.html`
3. 选择“腾讯翻译”，在 API Key 输入框填入 `SecretId|SecretKey`
4. 点击“开始识别”

## 代理接口
- 健康检查：GET http://localhost:3001/health
- 翻译接口：POST http://localhost:3001/api/tencent-translate
  - Body: `{ text, source: 'en', target: 'zh', secretId, secretKey }`

## 常见问题
- 不支持语音识别：请使用 Chrome/Edge 等支持 Web Speech API 的浏览器。
- 无法获取麦克风：检查浏览器麦克风权限。
- 腾讯翻译报错：确认代理已启动、密钥格式为 `SecretId|SecretKey`。

## 许可证
MIT
