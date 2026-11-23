// A tiny static server for the tools: serves the folder that holds this repo, so ../Mega-Clouds/ (a sibling clone)
// resolves the same way it does on crumplabsandbox.github.io. Also usable by hand: node tools/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
export const repo = path.resolve(here, '..');
export const root = path.dirname(repo);
export const base = '/' + path.basename(repo) + '/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain' };
export function serve(port = 0) {
  return new Promise(res => {
    const srv = http.createServer((req, r) => {
      let u = decodeURIComponent(req.url.split('?')[0].split('#')[0]); if (u.endsWith('/')) u += 'index.html';
      const f = path.join(root, u);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
    }).listen(port, () => res(srv));
  });
}
export function playwright() {
  return import('node:module').then(({ createRequire }) => {
    const require = createRequire(import.meta.url);
    for (const c of [process.env.PLAYWRIGHT, 'playwright', path.join(root, 'next-up/node_modules/playwright')]) {
      if (!c) continue; try { return require(c); } catch {}
    }
    throw new Error('Playwright not found (set PLAYWRIGHT=path/to/playwright)');
  });
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const srv = await serve(+(process.argv[2] || 8123));
  console.log(`http://localhost:${srv.address().port}${base}`);
}
