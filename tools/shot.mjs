// Screenshot every scene of an engine (or the app) headlessly.
//   node tools/shot.mjs <engine[,engine]> [out.png] [extra query, e.g. "stages=1" or "combo=1" or "t=40&frames=5"]
//   node tools/shot.mjs --page "?scene=island3d-shield&clouds=volumetric-cumulus" out.png
// Prints errors and per-scene timing. Needs Playwright (set PLAYWRIGHT=path/to/playwright if it isn't resolvable).
import { serve, playwright, base } from './serve.mjs';
const pw = await playwright();
const server = await serve();
const port = server.address().port;
const args = process.argv.slice(2);
const page = args[0] === '--page';
const target = page ? args[1] : args[0];
const out = (page ? args[2] : args[1]) || `/tmp/shot-${target.replace(/[^a-z0-9]+/gi, '_')}.png`;
const extra = page ? '' : (args[2] ? '&' + args[2] : '');
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await browser.newPage({ viewport: { width: page ? 1280 : 1460, height: page ? 720 : 900 } });
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const url = page ? `http://localhost:${port}${base}${target}` : `http://localhost:${port}${base}tools/preview.html?engine=${target}${extra}`;
await pg.goto(url);
if (page) await pg.waitForTimeout(+(process.env.WAIT || 5000));
else await pg.waitForFunction(() => window.__done !== undefined, null, { timeout: 300000 });
const caps = page ? [] : await pg.$$eval('figcaption', els => els.map(e => e.textContent));
await pg.screenshot({ path: out, fullPage: !page });
console.log(caps.join('\n'));
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
console.log('screenshot:', out);
await browser.close(); server.close();
