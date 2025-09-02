const crypto = require('crypto');

function generateTencentSignatureV3(host, service, action, version, region, timestamp, payload, secretId, secretKey) {
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { text, source, target } = req.body || {};
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;
    if (!text) {
      res.status(400).json({ error: '缺少必需参数: text' });
      return;
    }
    if (!secretId || !secretKey) {
      res.status(500).json({ error: '未配置环境变量 TENCENT_SECRET_ID/TENCENT_SECRET_KEY' });
      return;
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
      host, service, action, version, region, timestamp, payload, secretId, secretKey
    );

    const apiRes = await fetch(`https://${host}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'Authorization': authorization,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Region': region,
        'X-TC-Timestamp': String(timestamp)
      },
      body: payload
    });

    const data = await apiRes.json();
    if (!apiRes.ok || data.Response?.Error) {
      res.status(400).json({
        error: data.Response?.Error?.Code || 'BadRequest',
        message: data.Response?.Error?.Message || '请求失败'
      });
      return;
    }

    res.status(200).json({
      success: true,
      translatedText: data.Response?.TargetText || ''
    });
  } catch (e) {
    res.status(500).json({ error: '服务器内部错误', message: e.message });
  }
};


