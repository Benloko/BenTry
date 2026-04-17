const https = require('https');

const API_KEY = 'sk-afri-6916366db31947fea93ec8218bb600a1';

function httpsRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const r = https.request(options, (resp) => {
      const chunks = [];
      resp.on('data', d => chunks.push(d));
      resp.on('end', () => resolve({ status: resp.statusCode, type: resp.headers['content-type'], data: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function uploadToTmpfiles(audioBuffer, contentType, ext) {
  return new Promise((resolve, reject) => {
    const boundary = '----Boundary' + Date.now();
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${contentType}\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, audioBuffer, footer]);
    const r = https.request({
      hostname: 'tmpfiles.org', path: '/api/v1/upload', method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
    }, (resp) => {
      const chunks = [];
      resp.on('data', d => chunks.push(d));
      resp.on('end', () => {
        try {
          const d = JSON.parse(Buffer.concat(chunks).toString());
          if (d.data?.url) resolve(d.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/'));
          else reject(new Error('No URL'));
        } catch(e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const chunks = [];
  await new Promise(resolve => {
    req.on('data', d => chunks.push(d));
    req.on('end', resolve);
  });

  try {
    const audioBuffer = Buffer.concat(chunks);
    const contentType = req.headers['x-audio-type'] || req.headers['content-type'] || 'audio/ogg';
    const ext = contentType.includes('mp4') ? 'mp4' : contentType.includes('ogg') ? 'ogg' : 'webm';

    const audioUrl = await uploadToTmpfiles(audioBuffer, contentType, ext);
    const payload = JSON.stringify({ url: audioUrl, lang: 'fr' });
    const result = await httpsRequest({
      hostname: 'build.lewisnote.com', path: '/v1/audio/afri-asr/transcribe', method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, payload);

    res.status(result.status).json(JSON.parse(result.data.toString()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
