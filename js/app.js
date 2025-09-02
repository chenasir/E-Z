class RealtimeTranslatorApp {
    constructor() {
        this.apiType = 'tencent';
        this.apiKey = '';
        this.recognition = null;
        this.isRecording = false;
        this.partialBuffer = '';
        this.committedText = '';
        this.lastTranslatedText = '';
        this.translateTimer = null;
        this.pending = false;
        this.minChunkLen = 16; // 触发翻译的最小段长（略增）
        this.debounceMs = 1000; // 连续输入去抖（略放缓）
        this.windowSize = 1400; // 只翻译最近窗口的最大字符数
        this.autoTrimThreshold = 50000; // 累积过长时自动裁剪上限
        this.autoTrimKeep = 15000; // 裁剪后保留的末尾长度
        this.autoTrimIntervalMs = 5 * 60 * 1000; // 定时裁剪间隔：5分钟
        this.autoTrimTimer = null;
        this.autoPunct = true; // 智能加标点（解决 Chrome 通常无标点的问题）
        this.init();
    }

    init() {
        this.cacheDom();
        this.bindEvents();
        this.initASR();
        this.updateApiKeyPlaceholder();
        if (this.apiTypeSelect) this.apiTypeSelect.value = 'tencent';
    }

    cacheDom() {
        this.startBtn = document.getElementById('start-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.apiTypeSelect = document.getElementById('api-type');
        this.apiKeyInput = document.getElementById('api-key');
        this.englishLive = document.getElementById('english-live');
        this.chineseLive = document.getElementById('chinese-live');
        this.asrStatus = document.getElementById('asr-status');
        this.trStatus = document.getElementById('tr-status');
        // settings
        this.optWindow = document.getElementById('opt-window');
        this.optDebounce = document.getElementById('opt-debounce');
        this.optAutoscroll = document.getElementById('opt-autoscroll');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.resetSettingsBtn = document.getElementById('reset-settings');
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.clearBtn.addEventListener('click', () => this.clear());
        this.apiTypeSelect.addEventListener('change', (e) => {
            this.apiType = e.target.value;
            this.updateApiKeyPlaceholder();
        });
        this.apiKeyInput.addEventListener('input', (e) => {
            this.apiKey = e.target.value.trim();
        });

        // settings events
        if (this.saveSettingsBtn) {
            this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }
        if (this.resetSettingsBtn) {
            this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }
        this.loadSettings();
    }

    updateApiKeyPlaceholder() {
        if (this.apiType === 'tencent') {
            this.apiKeyInput.placeholder = '腾讯：无需填写（服务端环境变量提供）';
            this.apiKeyInput.value = '';
            this.apiKey = '';
            this.apiKeyInput.disabled = true;
        } else {
            this.apiKeyInput.placeholder = 'DeepSeek：sk-xxxxxxxxxxxxxxxxxxxx';
            this.apiKeyInput.disabled = false;
        }
    }

    initASR() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('当前浏览器不支持语音识别');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'en-US';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            let finalText = '';
            let interimText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                const t = res[0]?.transcript || '';
                if (res.isFinal) {
                    finalText += (t + ' ');
                } else {
                    interimText += t;
                }
            }
            finalText = finalText.trim();
            if (finalText) {
                const puncted = this.autoPunct ? this.autoPunctuate(finalText) : finalText;
                this.appendEnglish(puncted);
                this.partialBuffer = '';
                this.punctuationTrigger(puncted);
            } else {
                this.partialBuffer = interimText;
            }
            this.renderEnglishLive();
            this.scheduleTranslate();
        };

        this.recognition.onerror = (e) => {
            console.error('ASR error:', e);
            this.asrStatus.className = 'status off';
            this.asrStatus.textContent = '错误';
            this.isRecording = false;
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
        };

        this.recognition.onend = () => {
            if (this.isRecording) {
                try { this.recognition.start(); } catch (_) {}
            }
        };
    }

    async start() {
        if (!this.recognition) return;
        if (this.apiType === 'deepseek' && !this.apiKey) {
            alert('请先填写 DeepSeek API Key');
            return;
        }
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            alert('需要麦克风权限才能开始识别');
            return;
        }
        this.isRecording = true;
        this.asrStatus.className = 'status on';
        this.asrStatus.textContent = '识别中';
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        try { this.recognition.start(); } catch (_) {}
    }

    stop() {
        this.isRecording = false;
        this.asrStatus.className = 'status off';
        this.asrStatus.textContent = '已停止';
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        try { this.recognition.stop(); } catch (_) {}
    }

    clear() {
        this.englishLive.value = '';
        this.chineseLive.value = '';
        this.partialBuffer = '';
        this.committedText = '';
        this.lastTranslatedText = '';
    }

    appendEnglish(text) {
        const sep = this.committedText.endsWith('\n') || this.committedText === '' ? '' : ' ';
        this.committedText += (sep + text + '\n');
        this.updateEnglishTextarea();
        this.ensureAutoTrim();
    }

    renderEnglishLive() {
        this.updateEnglishTextarea();
    }

    updateEnglishTextarea() {
        const base = this.committedText.replace(/\s+$/g, '');
        const value = this.partialBuffer ? (base + (base ? ' ' : '') + this.partialBuffer) : base;
        this.englishLive.value = value;
        if (this.shouldAutoscroll()) this.scrollToBottom(this.englishLive);
    }

    scheduleTranslate() {
        if (this.translateTimer) clearTimeout(this.translateTimer);
        this.translateTimer = setTimeout(() => this.translateLive(), this.debounceMs);
    }

    async translateLive() {
        const english = (this.committedText + ' ' + (this.partialBuffer || '')).trim();
        if (english.length < this.minChunkLen) return;
        if (this.pending) return;

        // 只翻译最近窗口，降低费用与延迟
        const windowText = english.slice(-this.windowSize);
        // 避免对同样窗口重复翻译
        if (windowText === this.lastTranslatedText) return;

        this.pending = true;
        this.trStatus.className = 'status busy';
        this.trStatus.textContent = '翻译中';

        try {
            const zh = await (this.apiType === 'tencent' ? this.translateByTencent(windowText) : this.translateByDeepseek(windowText));
            this.lastTranslatedText = windowText;
            this.trStatus.className = 'status idle';
            this.trStatus.textContent = '已更新';
            this.chineseLive.value = zh;
            if (this.shouldAutoscroll()) this.scrollToBottom(this.chineseLive);
        } catch (e) {
            console.error('Translate error:', e);
            this.trStatus.className = 'status idle';
            this.trStatus.textContent = '失败';
        } finally {
            this.pending = false;
        }
    }

    punctuationTrigger(text) {
        // 遇到句号/问号/感叹号等标点立即触发（更及时）
        if (/[\.!?。！？]\s*$/.test(text)) {
            if (this.translateTimer) clearTimeout(this.translateTimer);
            this.translateLive();
        }
    }

    scrollToBottom(el) {
        if (!el) return;
        try {
            el.scrollTop = el.scrollHeight;
        } catch (_) {}
    }

    // ===== Settings =====
    loadSettings() {
        try {
            const raw = localStorage.getItem('rt_settings');
            if (!raw) return;
            const s = JSON.parse(raw);
            if (typeof s.windowSize === 'number') {
                this.windowSize = s.windowSize;
                if (this.optWindow) this.optWindow.value = String(s.windowSize);
            }
            if (typeof s.debounceMs === 'number') {
                this.debounceMs = s.debounceMs;
                if (this.optDebounce) this.optDebounce.value = String(s.debounceMs);
            }
            if (typeof s.autoscroll === 'boolean') {
                if (this.optAutoscroll) this.optAutoscroll.checked = s.autoscroll;
            }
            if (typeof s.autoPunct === 'boolean') {
                this.autoPunct = s.autoPunct;
            }
        } catch (_) {}
    }

    saveSettings() {
        const windowVal = parseInt(this.optWindow?.value || '1400', 10);
        const debounceVal = parseInt(this.optDebounce?.value || '1000', 10);
        const autoscrollVal = !!this.optAutoscroll?.checked;

        this.windowSize = Math.min(Math.max(windowVal, 200), 5000);
        this.debounceMs = Math.min(Math.max(debounceVal, 200), 5000);
        localStorage.setItem('rt_settings', JSON.stringify({
            windowSize: this.windowSize,
            debounceMs: this.debounceMs,
            autoscroll: autoscrollVal,
            autoPunct: this.autoPunct
        }));
        // 立即生效
        if (this.translateTimer) clearTimeout(this.translateTimer);
        this.translateTimer = setTimeout(() => this.translateLive(), this.debounceMs);
        alert('设置已保存');
    }

    resetSettings() {
        this.windowSize = 1400;
        this.debounceMs = 1000;
        if (this.optWindow) this.optWindow.value = '1400';
        if (this.optDebounce) this.optDebounce.value = '1000';
        if (this.optAutoscroll) this.optAutoscroll.checked = true;
        this.autoPunct = true;
        localStorage.removeItem('rt_settings');
        alert('已恢复默认设置');
    }

    shouldAutoscroll() {
        try {
            const raw = localStorage.getItem('rt_settings');
            if (!raw) return true;
            const s = JSON.parse(raw);
            return s.autoscroll !== false;
        } catch (_) { return true; }
    }

    ensureAutoTrim() {
        // 定时裁剪
        if (!this.autoTrimTimer) {
            this.autoTrimTimer = setInterval(() => this.trimBuffersIfNeeded(), this.autoTrimIntervalMs);
        }
        // 长度超限立即裁剪
        this.trimBuffersIfNeeded();
    }

    trimBuffersIfNeeded() {
        const totalLen = (this.committedText + (this.partialBuffer || '')).length;
        if (totalLen > this.autoTrimThreshold) {
            this.committedText = this.committedText.slice(-this.autoTrimKeep);
            // 保留一行开头美观
            if (!/^\s/.test(this.committedText)) this.committedText = this.committedText.replace(/^.*?\b/, '');
            this.updateEnglishTextarea();
        }
    }

    // ===== Chrome 无标点时的轻量补全 =====
    autoPunctuate(text) {
        try {
            const trimmed = text.trim();
            if (!trimmed) return text;
            // 已带结尾标点则不动
            if (/[\.!?。！？]$/.test(trimmed)) return text;

            // 规则：
            // 1) 疑问词结尾或以疑问助词结尾的片段 → 问号
            // 2) 感叹词结尾 → 感叹号
            // 3) 其它 → 句号
            const lower = trimmed.toLowerCase();
            const questionWords = [
                'what', 'when', 'where', 'who', 'whom', 'whose', 'which', 'why', 'how'
            ];
            const exclaimCues = [
                'great', 'amazing', 'incredible', 'unbelievable', 'wow', 'awesome'
            ];

            const lastToken = lower.split(/\s+/).pop() || '';
            if (questionWords.includes(lastToken) || /\?$/.test(lower)) {
                return trimmed + '?';
            }
            if (exclaimCues.includes(lastToken)) {
                return trimmed + '!';
            }
            return trimmed + '.';
        } catch (_) {
            return text;
        }
    }

    getTencentEndpoint() {
        try {
            const protocol = typeof location !== 'undefined' ? (location.protocol || '') : '';
            if (protocol === 'file:') {
                return 'http://localhost:3001/api/tencent-translate';
            }
            return '/api/tencent-translate';
        } catch (_) {
            return '/api/tencent-translate';
        }
    }

    async translateByDeepseek(text) {
        const apiUrl = 'https://api.deepseek.com/chat/completions';
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: '你是专业同传助手。将用户给出的英文连续文本，流畅准确地翻译为中文。只返回中文，不要解释。' },
                    { role: 'user', content: text }
                ],
                temperature: 0.2,
                max_tokens: 600
            })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error('DeepSeek API 错误: ' + res.status + ' ' + t);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }

    async translateByTencent(text) {
        const endpoint = this.getTencentEndpoint();
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                source: 'en',
                target: 'zh'
            })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error('腾讯代理错误: ' + res.status + ' ' + t);
        }
        const data = await res.json();
        // 兼容后端返回结构：本项目返回 {translatedText}
        return data.translatedText || data.TargetText || '';
    }
}

document.addEventListener('DOMContentLoaded', () => new RealtimeTranslatorApp());


