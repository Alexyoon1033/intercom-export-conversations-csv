import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'site');
const dist = path.join(root, 'dist');
const files = ['manifest.json', 'background.js', 'exporter.html', 'exporter.css', 'src', 'icons'];

fs.copyFileSync(path.join(root, 'exporter.html'), path.join(site, 'workstation.html'));
fs.copyFileSync(path.join(root, 'exporter.css'), path.join(site, 'exporter.css'));
for (const directory of ['src', 'icons']) {
  fs.cpSync(path.join(root, directory), path.join(site, directory), { recursive: true });
}

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
fs.mkdirSync(dist, { recursive: true });
const zipPath = path.join(dist, `chatvault-intercom-exporter-v${version}.zip`);
execFileSync('python', ['-m', 'zipfile', '-c', zipPath, ...files], { cwd: root, stdio: 'inherit' });
console.log(`Packaged Chrome Web Store ZIP: ${zipPath} (${fs.statSync(zipPath).size} bytes)`);
