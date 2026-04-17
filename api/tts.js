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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  try {
    const { text, voice } = req.body;
    const payload = JSON.stringify({ input: text, voice: voice || 'nova', response_format: 'mp3' });
    const result = await httpsRequest({
      hostname: 'build.lewisnote.com', path: '/v1/audio/speech', method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, payload);

    res.setHeader('Content-Type', result.type || 'audio/mpeg');
    res.status(result.status).send(result.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
