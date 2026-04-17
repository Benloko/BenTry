const { getDefaultConfig } = require('expo/metro-config');
const https = require('https');

const API_KEY = 'sk-afri-13e1185b7e9d4409b4383864bbb15cdd';

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
        const raw = Buffer.concat(chunks).toString();
        console.log('tmpfiles response:', raw.slice(0, 200));
        try {
          const d = JSON.parse(raw);
          if (d.data?.url) resolve(d.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/'));
          else reject(new Error('No URL: ' + raw.slice(0, 100)));
        } catch(e) { reject(new Error('Parse error: ' + raw.slice(0, 100))); }
      });
    });
    r.on('error', e => reject(new Error('Upload error: ' + e.message)));
    r.write(body);
    r.end();
  });
}

const config = getDefaultConfig(__dirname);

config.server = {
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

      if (req.method === 'POST' && req.url === '/transcribe') {
        const chunks = [];
        req.on('data', d => chunks.push(d));
        req.on('end', async () => {
          try {
            const audioBuffer = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || 'audio/webm';
            const ext = contentType.includes('mp4') ? 'mp4' : contentType.includes('ogg') ? 'ogg' : 'webm';
            console.log('Uploading audio, size:', audioBuffer.length, 'type:', contentType);

            const audioUrl = await uploadToTmpfiles(audioBuffer, contentType, ext);
            console.log('Audio URL:', audioUrl);

            const payload = JSON.stringify({ url: audioUrl, lang: 'fr' });
            const result = await httpsRequest({
              hostname: 'build.lewisnote.com', path: '/v1/audio/afri-asr/transcribe', method: 'POST',
              headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            }, payload);

            console.log('ASR status:', result.status, 'response:', result.data.toString().slice(0, 300));
            res.writeHead(result.status, { 'Content-Type': 'application/json' });
            res.end(result.data);
          } catch (e) {
            console.log('Transcribe error:', e.message);
            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/tts') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', async () => {
          try {
            const { text, voice } = JSON.parse(body);
            const payload = JSON.stringify({ input: text, voice: voice || 'nova', response_format: 'mp3' });
            const result = await httpsRequest({
              hostname: 'build.lewisnote.com', path: '/v1/audio/speech', method: 'POST',
              headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            }, payload);
            console.log('TTS status:', result.status, 'size:', result.data.length);
            res.writeHead(result.status, { 'Content-Type': result.type || 'audio/mpeg' });
            res.end(result.data);
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
        });
        return;
      }

      middleware(req, res, next);
    };
  },
};

module.exports = config;
