const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function makeHttpsRequest(hostname, options) {
    return new Promise((resolve, reject) => {
        const postData = options.body;
        const reqOptions = {
            hostname: hostname,
            port: 443,
            path: '/',
            method: options.method,
            headers: {
                ...options.headers,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON解析失败: ${e.message}, 响应: ${data}`)); }
            });
        });
        req.on('error', (err) => reject(new Error(`HTTPS请求失败: ${err.message}`)));
        req.write(postData);
        req.end();
    });
}

function generateTencentSignatureV3(host, service, region, action, version, timestamp, payload, secretId, secretKey) {
    const algorithm = 'TC3-HMAC-SHA256';
    const date = new Date(timestamp * 1000).toISOString().substr(0, 10);

    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');

    const canonicalRequest = [
        httpRequestMethod,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload
    ].join('\n');

    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

    const stringToSign = [
        algorithm,
        timestamp,
        credentialScope,
        hashedCanonicalRequest
    ].join('\n');

    const secretDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return authorization;
}

app.post('/api/tencent-translate', async (req, res) => {
    try {
        const { text, source, target, secretId, secretKey } = req.body;
        if (!text || !secretId || !secretKey) {
            return res.status(400).json({ error: '缺少必需参数: text, secretId, secretKey' });
        }
        const host = 'tmt.tencentcloudapi.com';
        const service = 'tmt';
        const region = 'ap-beijing';
        const action = 'TextTranslate';
        const version = '2018-03-21';
        const timestamp = Math.floor(Date.now() / 1000);

        const src = source || 'en';
        const tgt = target || 'zh';
        const payload = JSON.stringify({
            SourceText: text,
            Source: src,
            Target: tgt,
            ProjectId: 0
        });

        const authorization = generateTencentSignatureV3(
            host, service, region, action, version, timestamp, payload, secretId, secretKey
        );

        const data = await makeHttpsRequest(host, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Host': host,
                'Authorization': authorization,
                'X-TC-Action': action,
                'X-TC-Version': version,
                'X-TC-Region': region,
                'X-TC-Timestamp': timestamp.toString(),
            },
            body: payload
        });

        if (data.Response?.Error) {
            return res.status(400).json({
                error: data.Response.Error.Code,
                message: data.Response.Error.Message
            });
        }

        return res.json({
            success: true,
            translatedText: data.Response?.TargetText || ''
        });
    } catch (e) {
        console.error('Translate proxy error:', e);
        res.status(500).json({ error: '服务器内部错误', message: e.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, () => {
    console.log(`Tencent translate proxy listening on http://localhost:${PORT}`);
});


