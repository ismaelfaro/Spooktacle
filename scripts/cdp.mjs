// Opens a page in headless Chrome, waits until an expression is true, prints the console
// and saves a screenshot. For async pages (the audio lab renders in the background).
//
// Usage: node scripts/cdp.mjs <url> <output.png> [wait_expression] [width] [height] [timeout_ms]

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, waitExpr = 'document.readyState === "complete"', w = '1880', h = '1000', timeout = '90000'] = process.argv.slice(2);
if (!url || !out) { console.error('uso: node scripts/cdp.mjs <url> <salida.png> [espera] [ancho] [alto] [timeout]'); process.exit(2); }

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'hallowin-cdp-'));
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${w},${h}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const deadline = Date.now() + +timeout;

try {
  const portFile = join(profile, 'DevToolsActivePort');
  while (!existsSync(portFile)) { if (Date.now() > deadline) throw new Error('Chrome no arrancó'); await sleep(50); }
  await sleep(50);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  let targets = [];
  while (!(targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()).some(t => t.type === 'page')) await sleep(50);
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.consoleAPICalled') console.log(`[${msg.params.type}] ${msg.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`);
    else if (msg.method === 'Runtime.exceptionThrown') console.log(`[exception] ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  for (;;) {
    const r = await send('Runtime.evaluate', { expression: `!!(${waitExpr})` });
    if (r.result?.result?.value === true) break;
    if (Date.now() > deadline) { console.log('[timeout] la condición de espera no se cumplió'); break; }
    await sleep(250);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(out);
  ws.close();
} catch (err) {
  console.error('ERROR', err.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
