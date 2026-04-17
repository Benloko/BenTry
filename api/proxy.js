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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const path = req.query.path;
  if (!path) { res.status(400).json({ error: 'missing path' }); return; }

  try {
    const method = req.method;
    let body = null;
    if (method === 'POST') {
      const chunks = [];
      await new Promise(resolve => { req.on('data', d => chunks.push(d)); req.on('end', resolve); });
      body = Buffer.concat(chunks);
    }

    const result = await httpsRequest({
      hostname: 'build.lewisnote.com',
      path: '/' + path,
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...(body ? { 'Content-Length': body.length } : {})
      }
    }, body);

    res.status(result.status).setHeader('Content-Type', result.type || 'application/json');
    res.end(result.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
