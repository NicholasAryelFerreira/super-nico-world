// One-shot helper: receives canvas dataURLs from the game page and saves PNGs to screenshots/.
const http = require('http');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

let saved = 0;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const name = new URL(req.url, 'http://x').searchParams.get('name') || `shot${++saved}`;
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const b64 = body.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(b64, 'base64'));
    console.log(`saved ${name}.png (${b64.length} b64 chars)`);
    res.end('ok');
    saved++;
    if (saved >= 3) setTimeout(() => server.close(() => process.exit(0)), 300);
  });
});
server.listen(8124, () => console.log('listening on 8124'));
setTimeout(() => process.exit(1), 60000); // safety timeout
