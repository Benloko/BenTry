const http = require('http');
const https = require('https');

const PORT = 8082;
const API_KEY = 'sk-afri-13e1185b7e9d4409b4383864bbb15cdd';

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/generate-image') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { prompt } = JSON.parse(body);
        console.log('Generating image for:', prompt.slice(0, 50));

        // 1. Générer
        const genData = await new Promise((resolve, reject) => {
          const payload = JSON.stringify({ prompt });
          const r = https.request({
            hostname: 'build.lewisnote.com',
            path: '/v1/images/generations',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          }, (resp) => {
            let raw = '';
            resp.on('data', d => raw += d);
            resp.on('end', () => {
              try { resolve(JSON.parse(raw)); }
              catch(e) { reject(new Error('JSON parse error: ' + raw.slice(0, 200))); }
            });
          });
          r.on('error', reject);
          r.write(payload);
          r.end();
        });

        console.log('Gen response keys:', Object.keys(genData));
        const imgUrl = genData.url || genData.data?.[0]?.url;
        if (!imgUrl) {
          console.log('No URL in response:', JSON.stringify(genData).slice(0, 300));
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'No image URL in API response', detail: JSON.stringify(genData).slice(0, 300) }));
          return;
        }

        console.log('Downloading image from:', imgUrl);

        // 2. Télécharger immédiatement
        const imgData = await new Promise((resolve, reject) => {
          const urlObj = new URL(imgUrl);
          https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: { 'Authorization': `Bearer ${API_KEY}` }
          }, (resp) => {
            console.log('Image download status:', resp.statusCode, resp.headers['content-type']);
            const chunks = [];
            resp.on('data', d => chunks.push(d));
            resp.on('end', () => resolve({ status: resp.statusCode, type: resp.headers['content-type'], data: Buffer.concat(chunks) }));
          }).on('error', reject);
        });

        if (imgData.status !== 200 || !imgData.type?.startsWith('image')) {
          console.log('Download failed:', imgData.status, imgData.data.toString().slice(0, 200));
          res.writeHead(500);
          res.end(JSON.stringify({ error: `Download failed: ${imgData.status}`, detail: imgData.data.toString().slice(0, 200) }));
          return;
        }

        const b64 = `data:${imgData.type};base64,${imgData.data.toString('base64')}`;
        console.log('Success! b64 length:', b64.length);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ b64 }));

      } catch (e) {
        console.log('Error:', e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
}).listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));
