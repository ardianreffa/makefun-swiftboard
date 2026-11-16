// Takes the entry's screenshots from the running app on live make.fun data (Node 22+, no dependencies).
//   node tools/shots.mjs            every shot of shots.json into screenshots/
//   node tools/shots.mjs --out out/shots   somewhere else, to look before settling
// It serves app/ with serve.ts, opens each route in headless Chrome over the DevTools protocol, waits for
// window.__shotReady and captures the viewport as a JPEG. Nothing is edited afterwards.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const outDir = option('--out', join(repo, 'screenshots'));
const port = Number(option('--port', 8137));
const debugPort = port + 1;
const quality = Number(option('--quality', 82));
const chromePath = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// --shots <file> reads another list (same shape as shots.json), for looking at routes that are not handed in.
const shots = JSON.parse(readFileSync(option('--shots', join(repo, 'shots.json')), 'utf8'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
/** Wait until the wall clock next reads the given second of the minute. */
const untilSecond = (second) => sleep(((second * 1000 - (Date.now() % 60000) + 60000) % 60000) || 1);

const server = spawn(process.execPath, [join(repo, 'serve.ts'), '--port', String(port)], { stdio: 'ignore' });
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'swiftboard-'))}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

async function debuggerUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = pages.find((p) => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}

try {
  const socket = new WebSocket(await debuggerUrl());
  await new Promise((open, fail) => ((socket.onopen = open), (socket.onerror = fail)));
  const waiting = new Map();
  let nextId = 0;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = ++nextId;
      waiting.set(id, (message) => (message.error ? fail(new Error(`${method}: ${message.error.message}`)) : done(message.result)));
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

  await send('Page.enable');
  mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    const { width, height } = shot.viewport;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send('Page.navigate', { url: 'about:blank' });
    if (shot.startAtSecond != null) await untilSecond(shot.startAtSecond);
    await send('Page.navigate', { url: `http://localhost:${port}/${shot.path}` });
    const settle = async (what) => {
      let ready = false;
      for (let i = 0; i < 300 && !ready; i++) {
        await sleep(100);
        ready = (await evaluate('window.__shotReady === true')) === true;
      }
      if (!ready) throw new Error(`${shot.file}: ${what} never became ready`);
    };
    await settle('the route');
    // Optional real use of the app before the capture, in the same page: a string is a hash route to go to by
    // its link's address, as a click would; { "untilSecond": n } waits for the clock to reach that second of
    // the minute (the app revalidates its cache only once the minute has turned); { "sleep": ms } leaves the
    // tab open, which lets the app's own once-a-minute revalidation run. Nothing is injected: the header's
    // request and cache counts are whatever these visits really cost.
    for (const step of shot.steps || []) {
      if (typeof step === 'string') {
        await evaluate(`window.__shotReady = false; location.hash = ${JSON.stringify(step)}`);
        await settle(step);
        await sleep(300);
      } else if (step.untilSecond != null) await untilSecond(step.untilSecond);
      else if (step.sleep) {
        await sleep(step.sleep);
        await settle('the open tab');
      }
    }
    if (shot.steps) console.log(`${shot.file}: header ->`, await evaluate("document.getElementById('net').textContent"));
    // An optional expression to run in the page first (scroll a list, read a counter); its value is printed.
    if (shot.run) console.log(`${shot.file}: run ->`, JSON.stringify(await evaluate(shot.run)));
    // Let avatars and the last frame land before the capture.
    await evaluate('Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => (i.onload = i.onerror = r))))');
    await sleep(400);
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
    const bytes = Buffer.from(data, 'base64');
    writeFileSync(join(outDir, shot.file), bytes);
    console.log(`${shot.file}: ${shot.path} at ${width}x${height}, ${bytes.length} bytes`);
  }
  socket.close();
} finally {
  chrome.kill();
  server.kill();
}
