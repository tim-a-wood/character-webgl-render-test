'use strict';
// Diagnostic only. Deploy beside the unchanged package68/transport-original-inputs68.json.
// No geometry, external assets, runtime edits, retries, cache overrides, or failure exemptions.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const check = (value, message) => { if (!value) throw Error(message); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const root = path.resolve(process.env.TRANSPORT_RUNTIME_ROOT || path.join(__dirname, '..'));
const pins = {
  'package68/transport-original-inputs68.json': 'e8eeab45f99398382d6166518d2650e33d3bb6ba9bb7a4d5ae8329fb69887922',
  'package68/packed68/manifest68.json': '26849b1833c4f22a3f15082be0379b3f2d242be14f3b1248fd64b17759ae7117',
  'package55/compressed-store55.js': '7e48e84a553ff914083b4e06c7c1266012ed8771264f17e3291ec6952aa60c28',
};
function pinned(name) {
  const target = path.resolve(root, name);
  check(target.startsWith(root + path.sep) && !fs.lstatSync(target).isSymbolicLink(), 'Unsafe file: ' + name);
  const bytes = fs.readFileSync(target);
  check(sha(bytes) === pins[name], 'Frozen input mismatch: ' + name);
  return bytes;
}
const inputs = JSON.parse(pinned('package68/transport-original-inputs68.json'));
const manifest = JSON.parse(pinned('package68/packed68/manifest68.json'));
const storeBytes = pinned('package55/compressed-store55.js');
check(inputs.mode === 'full' && inputs.nativeSamples === 80 && manifest.frames.length === 80, 'Actual full80 manifest required');
const localFiles = new Map(inputs.localFiles.map(f => [f.path, f]));
const sourceFrames = [539, 541, 599];
const frames = sourceFrames.map(sourceFrame => {
  const f = manifest.frames.find(x => x.sourceFrame === sourceFrame);
  check(f && Number.isSafeInteger(f.compressedBytes) && f.compressedBytes > 0, 'Missing selected frame');
  const name = path.posix.normalize('package68/packed68/' + f.url), receipt = localFiles.get(name);
  check(receipt && receipt.sha256 === f.sha256 && receipt.bytes === f.compressedBytes, 'Frame receipt mismatch');
  const target = path.resolve(root, name);
  check(target.startsWith(root + path.sep) && !fs.lstatSync(target).isSymbolicLink(), 'Unsafe frame');
  const bytes = fs.readFileSync(target);
  check(bytes.length === f.compressedBytes && sha(bytes) === f.sha256, 'Frame bytes mismatch');
  return { sourceFrame, name, url: '/' + name, compressedBytes: f.compressedBytes, sha256: f.sha256, bytes };
});
const bytesPerCase = frames.reduce((sum, f) => sum + f.compressedBytes, 0);
check(bytesPerCase < 16 * 1024 * 1024, 'Diagnostic subset exceeds16MiB');
const arms = [
  { name: 'no-store-stream', cacheControl: 'no-store', consumer: 'unchanged-compressed-store55' },
  { name: 'no-cache-stream', cacheControl: 'no-cache', consumer: 'unchanged-compressed-store55' },
  { name: 'no-store-arrayBuffer', cacheControl: 'no-store', consumer: 'native-arrayBuffer-diagnostic-only' },
];
const validation = { pins, sourceFrames, totalManifestFrames: manifest.frames.length, bytesPerCase, repetitions: 3, arms, runtimeFilesModified: false };
if (process.argv.includes('--validate-only')) { console.log('TRANSPORT68_VALIDATION', JSON.stringify(validation)); process.exit(0); }
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Exact Playwright1.57.0 required');
const results = [], infrastructureErrors = [];
let browser, origin, activeCase;
const frameByPath = new Map(frames.map(f => [f.url, f]));
const allowedPaths = new Set(['/transport68/index.html', '/package55/compressed-store55.js', ...frameByPath.keys()]);
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    check(req.method === 'GET' && !url.search && allowedPaths.has(url.pathname), 'Outside exact local allowlist');
    const frame = frameByPath.get(url.pathname);
    const bytes = frame?.bytes || (url.pathname.endsWith('.js') ? storeBytes : Buffer.from('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Transport diagnostic</title>'));
    const item = activeCase;
    if (frame) {
      check(item, 'No active case');
      const record = { sourceFrame: frame.sourceFrame, bytes: bytes.length, aborted: false, finished: false, prematureClose: false };
      item.server.push(record);
      req.on('aborted', () => { record.aborted = true; });
      res.on('finish', () => { record.finished = true; });
      res.on('close', () => { record.prematureClose = !res.writableFinished; });
      res.on('error', error => { record.error = error.message; });
    }
    res.writeHead(200, { 'Content-Type': frame ? 'application/octet-stream' : url.pathname.endsWith('.js') ? 'application/javascript' : 'text/html', 'Content-Length': bytes.length, 'Cache-Control': frame ? item.arm.cacheControl : 'no-store' });
    res.end(bytes); // Exact original test-server write pattern. No synthetic delay.
  } catch (error) { infrastructureErrors.push(error.message); res.writeHead(404).end('Not found'); }
});
function deadline(promise, milliseconds, description) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(description)), milliseconds); })]).finally(() => clearTimeout(timer));
}
async function runCase(arm, repeat) {
  const item = { arm, repeat, server: [], playwright: [], cdp: [], errors: [], blocked: [], application: null };
  activeCase = item;
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const isFrame = url => { const u = new URL(url); return u.origin === origin && !u.search && frameByPath.has(u.pathname); };
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === origin && !u.search && allowedPaths.has(u.pathname)) return route.continue();
    item.blocked.push(u.href); return route.abort();
  });
  const page = await context.newPage(), session = await context.newCDPSession(page);
  const pendingPW = new Set(), cdpRequests = new Map();
  let wake;
  const notify = () => { if (wake) { const fn = wake; wake = null; fn(); } };
  page.on('pageerror', error => item.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') item.errors.push(message.text()); });
  page.on('request', req => { if (isFrame(req.url())) pendingPW.add(req); });
  page.on('requestfinished', req => {
    if (!isFrame(req.url())) return;
    item.playwright.push({ path: new URL(req.url()).pathname, event: 'requestfinished' }); pendingPW.delete(req); notify();
  });
  page.on('requestfailed', req => {
    item.playwright.push({ path: new URL(req.url()).pathname, event: 'requestfailed', error: req.failure()?.errorText }); pendingPW.delete(req); notify();
  });
  page.on('response', response => { if (response.status() >= 400) item.errors.push('HTTP ' + response.status() + ' ' + response.url()); });
  session.on('Network.requestWillBeSent', event => {
    if (!isFrame(event.request.url)) return;
    cdpRequests.set(event.requestId, { path: new URL(event.request.url).pathname, requestId: event.requestId, dataLength: 0, terminal: null });
  });
  session.on('Network.dataReceived', event => {
    const row = cdpRequests.get(event.requestId); if (row) row.dataLength += event.dataLength;
  });
  session.on('Network.loadingFinished', event => {
    const row = cdpRequests.get(event.requestId); if (!row) return;
    row.terminal = 'loadingFinished'; row.encodedDataLength = event.encodedDataLength; notify();
  });
  session.on('Network.loadingFailed', event => {
    const row = cdpRequests.get(event.requestId); if (!row) return;
    row.terminal = 'loadingFailed'; row.error = event.errorText; row.canceled = !!event.canceled; row.blockedReason = event.blockedReason || null; notify();
  });
  try {
    await session.send('Network.enable');
    await page.goto(origin + '/transport68/index.html', { waitUntil: 'load' });
    item.application = await deadline(page.evaluate(async ({ arm, frames, maxBytes }) => {
      const toHex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
      if (arm.consumer === 'unchanged-compressed-store55') {
        const { createCompressedStore55 } = await import('/package55/compressed-store55.js');
        // Original shipped implementation, including its manual reader, fixed-size
        // allocation, size limit, EOF, SHA256 and cancellation logic. No API wrappers.
        const store = await createCompressedStore55({ frames, maxBytes });
        globalThis.__diagnosticStore68 = store;
        return { ok: true, stats: store.getStats() };
      }
      // Diagnostic reference only: not a proposed bounded-memory runtime replacement.
      const retained = [], verified = [];
      for (const frame of frames) {
        const response = await fetch(frame.url, { credentials: 'same-origin', referrerPolicy: 'no-referrer' });
        if (!response.ok || Number(response.headers.get('content-length')) !== frame.compressedBytes) throw Error('Diagnostic response/length mismatch');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== frame.compressedBytes || toHex(await crypto.subtle.digest('SHA-256', bytes)) !== frame.sha256) throw Error('Diagnostic payload integrity');
        retained.push(bytes); verified.push({ url: frame.url, bytes: bytes.byteLength, sha256: frame.sha256 });
      }
      globalThis.__diagnosticBuffers68 = retained;
      return { ok: true, verifiedFiles: verified.length, verifiedBytes: retained.reduce((sum, x) => sum + x.byteLength, 0), verified };
    }, { arm, frames: frames.map(({ bytes, name, sourceFrame, ...f }) => f), maxBytes: bytesPerCase }), 30000, 'Application read exceeded30seconds');
    await deadline((async () => {
      while (pendingPW.size || item.playwright.filter(x => frameByPath.has(x.path)).length < frames.length || cdpRequests.size < frames.length || [...cdpRequests.values()].some(x => !x.terminal)) await new Promise(resolve => { wake = resolve; });
    })(), 10000, 'Original request terminal missing after10seconds');
  } catch (error) { item.errors.push(error.message); }
  item.cdp = [...cdpRequests.values()];
  item.integrityPass = item.application?.ok === true && (item.application.stats?.verifiedFiles ?? item.application.verifiedFiles) === frames.length && (item.application.stats?.storedCompressedBytes ?? item.application.verifiedBytes) === bytesPerCase;
  item.strictPass = item.integrityPass && !item.errors.length && !item.blocked.length && item.playwright.length === frames.length && item.playwright.every(x => x.event === 'requestfinished') && item.cdp.length === frames.length && item.cdp.every(x => x.terminal === 'loadingFinished') && item.server.length === frames.length && item.server.every(x => x.finished && !x.aborted && !x.prematureClose && !x.error);
  // Snapshot before teardown. Never treat teardown-induced failures as pre-teardown completion.
  results.push(JSON.parse(JSON.stringify(item)));
  console.log('TRANSPORT68_CASE', JSON.stringify(item));
  await context.close(); activeCase = null;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--use-gl=angle', '--use-angle=swiftshader'], timeout: 60000 });
  const browserSession = await browser.newBrowserCDPSession();
  const command = await browserSession.send('Browser.getBrowserCommandLine');
  check(!command.arguments.some(a => ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--disable-web-security', '--ignore-gpu-blocklist', '--ignore-certificate-errors'].some(flag => a === flag || a.startsWith(flag + '='))), 'Unsafe Chromium flag');
  console.log('BROWSER68', JSON.stringify({ version: await browser.version(), arguments: command.arguments, sandbox: true }));
  for (let repeat = 0; repeat < 3; repeat++) for (let index = 0; index < arms.length; index++) await runCase(arms[(index + repeat) % arms.length], repeat);
  const summaries = arms.map(arm => {
    const rows = results.filter(x => x.arm.name === arm.name);
    return { arm: arm.name, cases: rows.length, integrityPasses: rows.filter(x => x.integrityPass).length, strictPasses: rows.filter(x => x.strictPass).length, requestFailures: rows.flatMap(x => x.playwright).filter(x => x.event === 'requestfailed').length };
  });
  const report = { format: 'einar68-fullmanifest-transport-matrix-v1', validation, summaries, infrastructureErrors, results,
    runtimeFilesModified: false, requestFailureExemptions: false, wholeWalkProof: false, memoryBoundClaimForArrayBuffer: false,
    comparisonSupportsNoStoreStreamInteraction: summaries[0].integrityPasses === 3 && summaries[0].requestFailures > 0 && summaries[1].strictPasses === 3 && summaries[2].strictPasses === 3 && !infrastructureErrors.length };
  const output = path.join(__dirname, 'proof-results68'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'transport-matrix68.json'), JSON.stringify(report, null, 2));
  console.log('TRANSPORT68_MATRIX', JSON.stringify(report));
  check(!infrastructureErrors.length && results.every(x => x.strictPass), 'Strict transport failed; comparative evidence preserved, no exemption applied');
})().catch(error => { console.error('TRANSPORT68_FAILED', error.stack); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); server.closeAllConnections(); server.close();
});
