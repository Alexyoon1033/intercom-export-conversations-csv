import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = path.resolve('c:/YDW/AI/Antigravity/chatvault-intercom-exporter');
const siteDir = path.join(rootDir, 'site');
const distDir = path.join(rootDir, 'dist');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// 1. Copy exporter.html -> site/workstation.html, exporter.css -> site/exporter.css, src/ -> site/src/, icons/ -> site/icons/
fs.copyFileSync(path.join(rootDir, 'exporter.html'), path.join(siteDir, 'workstation.html'));
fs.copyFileSync(path.join(rootDir, 'exporter.css'), path.join(siteDir, 'exporter.css'));
copyRecursive(path.join(rootDir, 'src'), path.join(siteDir, 'src'));
copyRecursive(path.join(rootDir, 'icons'), path.join(siteDir, 'icons'));

// Remove legacy _redirects and duplicate subfolders so Cloudflare Pages Pretty URLs serves /privacy, /workstation, /guide-missing-message-text cleanly without redirect loops
for (const stale of ['_redirects', 'privacy', 'workstation', 'guide']) {
  const stalePath = path.join(siteDir, stale);
  if (fs.existsSync(stalePath)) {
    fs.rmSync(stalePath, { recursive: true, force: true });
  }
}

console.log('Synced web workstation & Cloudflare Pages routes into site/');

// 2. Build Chrome Web Store submission ZIP in dist/chatvault-intercom-exporter-v1.0.0.zip
const stageDir = path.join(distDir, 'extension-stage');
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(stageDir, { recursive: true });

for (const file of ['manifest.json', 'background.js', 'exporter.html', 'exporter.css']) {
  fs.copyFileSync(path.join(rootDir, file), path.join(stageDir, file));
}
copyRecursive(path.join(rootDir, 'src'), path.join(stageDir, 'src'));
copyRecursive(path.join(rootDir, 'icons'), path.join(stageDir, 'icons'));

const zipPath = path.join(distDir, 'chatvault-intercom-exporter-v1.0.0.zip');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

console.log(`Packaged Chrome Web Store ZIP: ${zipPath} (${fs.statSync(zipPath).size} bytes)`);
