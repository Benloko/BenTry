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

module.exports = function createProxyMiddleware(metroServer) {
  const originalMiddleware = metroServer.middleware;
  return async function(req, res, next) {
    if (req.method === 'POST' && req.url === '/generate-image') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { prompt } = JSON.parse(body);
          const payload = JSON.stringify({ prompt });
          // Générer
          const gen = await httpsRequest({
            hostname: 'build.lewisnote.com', path: '/v1/images/generations', method: 'POST',
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          }, payload);
          const genData = JSON.parse(gen.data.toString());
          const imgUrl = genData.url || genData.data?.[0]?.url;
          if (!imgUrl) { res.writeHead(500); res.end(JSON.stringify({ error: 'No URL', detail: gen.data.toString().slice(0, 200) })); return; }
          // Télécharger immédiatement
          const urlObj = new URL(imgUrl);
          const img = await httpsRequest({
            hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET',
            headers: { 'Authorization': `Bearer ${API_KEY}` }
          });
          if (img.status !== 200 || !img.type?.startsWith('image')) {
            res.writeHead(500); res.end(JSON.stringify({ error: `Download failed ${img.status}`, detail: img.data.toString().slice(0, 200) })); return;
          }
          const b64 = `data:${img.type};base64,${img.data.toString('base64')}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ b64 }));
        } catch(e) {
          res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.writeHead(200); res.end(); return; }
    next();
  };
};
