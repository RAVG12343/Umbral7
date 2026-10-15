#!/usr/bin/env node
/*
  fetch-assets.js
  Downloads the assets listed in public/models/manifest.json into public/models/local/
  Run: node scripts/fetch-assets.js
*/
const fs = require('fs');
const path = require('path');
const https = require('https');

const manifestPath = path.join(__dirname, '..', 'public', 'models', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json not found at', manifestPath);
  process.exit(1);
}

const outDir = path.join(__dirname, '..', 'public', 'models', 'local');
fs.mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const items = (manifest.models || []).concat(manifest.sounds || []);

function download(url, out) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(out);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // redirect
        return download(res.headers.location, out).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlinkSync(out);
      reject(err);
    });
  });
}

(async () => {
  for (const it of items) {
    try {
      const url = it.url;
      const name = path.basename(url.split('?')[0]);
      const out = path.join(outDir, name);
      if (fs.existsSync(out)) {
        console.log('Already have', name);
        continue;
      }
      console.log('Downloading', url, '->', out);
      await download(url, out);
      console.log('Done', name);
    } catch (e) {
      console.error('Failed to download', it.url, e.message || e);
    }
  }
  console.log('All done. Check public/models/local/ for downloaded assets.');
})();
