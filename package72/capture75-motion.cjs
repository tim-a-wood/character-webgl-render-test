'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs75-motion.json')));
check(inputs.schema === 'exact-motion-window-inputs75-v1' && inputs.expectedCaptureCount === 52, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results75-motion'); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || inputs.entry;
    check(files.has(name), 'Not in frozen allowlist'); const frozen = files.get(name);
    const bytes = fs.readFileSync(path.join(root, name)); check(bytes.length === frozen.bytes && sha(bytes) === frozen.sha256, 'Changed served bytes');
    res.writeHead(200, { 'Content-Type': { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.md': 'text/plain' }[path.extname(name)] || 'application/octet-stream',
      'Content-Length': bytes.length, 'Cache-Control': /^vendor\/three\/examples\/jsm\/libs\/basis\/basis_transcoder\.(js|wasm)$/.test(name) ? 'no-cache' : 'no-store' }); res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
let browser, page, cdp, cold, browserConfig, throttling;
const frames = [];
const errors = [], warnings = [], blocked = [], failedRequests = [], transfers = new Map(), snapshots = [];
function saveImage(label, dataURL) {
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `motion75-${label}.png`;
  fs.writeFileSync(path.join(output, filename), bytes);
  const record = { name: filename, bytes: bytes.length, sha256: sha(bytes), mime: 'image/png' };
  console.log('RENDER_IMAGE_BEGIN', JSON.stringify(record)); const encoded = bytes.toString('base64');
  for (let i = 0; i < encoded.length; i += 2048) console.log('RENDER_IMAGE_CHUNK', String(i / 2048).padStart(5, '0'), encoded.slice(i, i + 2048));
  console.log('RENDER_IMAGE_END'); return record;
}
async function snapshot(label) {
  await page.evaluate(() => window.characterQA72.rendered());
  const snap = await page.evaluate(() => window.characterQA72.snapshot());
  check(snap.finite && snap.pixels.nonBackgroundPixels > 500 && snap.draw.triangles > 0, 'Invalid or empty character snapshot: ' + label);
  snap.poseSha256 = sha(snap.poseSignature); delete snap.poseSignature; snap.image = saveImage(label, snap.image);
  snapshots.push({ label, ...snap }); return snap;
}
async function diagnostics() {
  if (!page) return null;
  let timer;
  const result = await Promise.race([page.evaluate(() => ({ state: window.characterQA72?.report(), text: document.body.innerText.slice(0, 2000) })).catch(e => ({ error: String(e) })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), 5000); })]);
  clearTimeout(timer); return result;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--use-gl=angle', '--use-angle=swiftshader'], timeout: 60000 });
  const session = await browser.newBrowserCDPSession(); const command = await session.send('Browser.getBrowserCommandLine');
  const forbidden = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--disable-web-security', '--ignore-gpu-blocklist', '--ignore-certificate-errors'];
  check(!command.arguments.some(a => forbidden.some(f => a === f || a.startsWith(f + '='))), 'Unsafe Chromium launch');
  browserConfig = { version: await browser.version(), arguments: command.arguments, sandbox: true,
    viewport: inputs.viewport, deviceScaleFactor: inputs.deviceScaleFactor, conditions: inputs.conditionsLabel };
  const context = await browser.newContext({ viewport: inputs.viewport, deviceScaleFactor: inputs.deviceScaleFactor, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = route.request().url(); if (new URL(url).origin === origin) return route.continue();
    blocked.push(url); return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(60000); cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  // These are controlled synthetic conditions, not a device emulation claim. Failure is explicit.
  throttling = { network: inputs.network, cpuRate: inputs.cpuThrottlingRate, applied: false };
  await cdp.send('Network.emulateNetworkConditions', inputs.network);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: inputs.cpuThrottlingRate }); throttling.applied = true;
  cdp.on('Network.requestWillBeSent', e => transfers.set(e.requestId, { requestId: e.requestId, url: e.request.url, startSeconds: e.timestamp }));
  cdp.on('Network.responseReceived', e => {
    const item = transfers.get(e.requestId); if (item) Object.assign(item, { status: e.response.status,
      fromDiskCache: !!e.response.fromDiskCache, fromServiceWorker: !!e.response.fromServiceWorker, fromPrefetchCache: !!e.response.fromPrefetchCache,
      protocol: e.response.protocol, responseSeconds: e.timestamp });
  });
  cdp.on('Network.loadingFinished', e => { const item = transfers.get(e.requestId); if (item) Object.assign(item, { completed: true, finishedSeconds: e.timestamp,
    encodedDataLength: e.encodedDataLength, requestDurationMs: 1000 * (e.timestamp - item.startSeconds) }); });
  cdp.on('Network.loadingFailed', e => { const item = transfers.get(e.requestId); if (item) Object.assign(item, { failed: true, error: e.errorText, failedSeconds: e.timestamp, canceled: !!e.canceled, blockedReason: e.blockedReason ?? null }); });
  page.on('pageerror', e => errors.push({ kind: 'pageerror', message: e.message }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ kind: 'console', message: m.text() }); else if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('requestfailed', r => failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
  page.on('response', r => { if (r.status() >= 400) errors.push({ kind: 'http', message: `${r.status()} ${r.url()}` }); });
  await page.goto(origin + '/' + inputs.entry, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.characterQA72?.ready || window.characterQA72?.report().failure, null, { timeout: 120000 });
  check(await page.evaluate(() => window.characterQA72.ready), 'App failed to load standard export');
  await page.waitForFunction(() => window.characterQA72.report().firstPresentationOpportunityMs !== null);
  cold = await page.evaluate(() => window.characterQA72.report());
  check(cold.asset.sha256===inputs.asset.sha256 && cold.asset.bytes===inputs.asset.bytes,'Exact final diagnostic asset required');
  check(Math.abs(cold.duration-inputs.expectedDuration)<1e-5,'Source duration changed');
  const names=await page.locator('#animation option').evaluateAll(options=>options.map(o=>o.value));
  check(inputs.clips.every(name=>names.includes(name)),'Both exact before/after clips required');
  const hashesBefore=await page.evaluate(()=>window.characterQA72.geometryHashes());
  await page.evaluate(()=>{const q=window.characterQA72;q.pause();q.cancelBenchmark();q.setEyeSurfaceMode74('candidate');q.selectAnimation('Walk539_618');q.reset();q.frameView('whole');});
  await page.evaluate(()=>window.characterQA72.rendered());
  const camera=await page.evaluate(()=>window.characterQA72.report().camera),cameraSha256=sha(JSON.stringify(camera));
  const materials=await page.evaluate(()=>window.characterQA72.eyeSurfaceState74());
  check(materials.length===2&&materials.every(m=>m.mode==='candidate'&&m.visible&&Object.values(m.preserved).every(Boolean)),'Shared reviewed eye surfaces changed');
  for(const clipName of inputs.clips){
    await page.locator('#animation').selectOption(clipName);
    for(const window of inputs.windows){
      check(window.last-window.first===12,'Only two bounded13-key windows');
      for(let sourceFrame=window.first;sourceFrame<=window.last;sourceFrame++){
        const captured=await page.evaluate(frame=>window.characterQA72.captureSourceFrame75(frame),sourceFrame);
        check(captured.finite&&captured.pixels.nonBackgroundPixels>500&&captured.draw.triangles>0,'Invalid rendered comparison pose');
        check(captured.clipName===clipName&&captured.sourceFrame===sourceFrame&&!captured.neutral,'Wrong clip/frame pose');
        check(sha(JSON.stringify(captured.camera))===cameraSha256,'Frozen comparison camera changed');
        check(captured.joints.length>=8,'Missing thigh/knee/foot/toe metadata');
        check(Math.abs(captured.sourceTimeSeconds-captured.nominalSourceTimeSeconds)<2e-6,'Source clock/sample changed');
        const foot=captured.projectedFootwearBounds;
        check(foot.min[0]>=-1&&foot.max[0]<=1&&foot.min[1]>=-1&&foot.max[1]<=1,'Whole-character framing cuts footwear');
        const label=(clipName==='Diagnostic_BeforeWalk'?'before':'after')+'-'+window.side+'-frame'+sourceFrame;
        captured.poseSha256=sha(captured.poseSignature);delete captured.poseSignature;
        captured.image=saveImage(label,captured.image);captured.window=window.side;
        frames.push(captured);console.log('MOTION75_FRAME',JSON.stringify(captured));
      }
    }
  }
  check(frames.length===52,'Exactly52native-key renders required');
  const pairs=[];for(const before of frames.filter(f=>f.clipName==='Diagnostic_BeforeWalk')){
    const after=frames.find(f=>f.clipName==='Walk539_618'&&f.sourceFrame===before.sourceFrame);
    check(after&&before.sourceTimeSeconds===after.sourceTimeSeconds,'Before/after sample timestamps differ');
    const deltas=before.joints.map(old=>{const next=after.joints.find(j=>j.name===old.name);check(next,'Missing matched joint');return{name:old.name,worldPositionDeltaMetres:Math.hypot(...next.worldPosition.map((v,i)=>v-old.worldPosition[i]))};});
    pairs.push({sourceFrame:before.sourceFrame,window:before.window,sourceTimeSeconds:before.sourceTimeSeconds,
      beforeImage:before.image,afterImage:after.image,beforePoseSha256:before.poseSha256,afterPoseSha256:after.poseSha256,
      jointPositionDeltas:deltas,footwearBounds:{before:before.footwearBounds,after:after.footwearBounds}});
  }
  const hashesAfter=await page.evaluate(()=>window.characterQA72.geometryHashes());
  check(JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter),'Shared geometry or morph basis was modified');
  const final=await page.evaluate(()=>window.characterQA72.report());
  check(final.glErrors.length===0&&final.contextLosses===0&&final.attributeVersionsUnchanged,'WebGL/geometry failure');
  check(final.benchmark===null,'No playback benchmark allowed in this comparison');
  const controls=await page.evaluate(()=>({playEnabled:!document.getElementById('play').disabled,pauseDisabled:document.getElementById('pause').disabled,resetEnabled:!document.getElementById('reset').disabled,selectedClip:document.getElementById('animation').value,playing:window.characterQA72.report().playing}));
  check(controls.playEnabled&&controls.pauseDisabled&&controls.resetEnabled&&!controls.playing,'Unexpected paused exact-seek control state');
  const assets=[...transfers.values()].filter(t=>new URL(t.url).pathname==='/'+inputs.asset.filename);
  check(assets.length===1&&assets[0].completed,'One model download/loaded model required');
  check(errors.length===0&&failedRequests.length===0&&blocked.length===0,'Runtime/network failure');
  const report={schema:'exact-motion-window-result75-v1',pass:true,completedAt:new Date().toISOString(),asset:inputs.asset,
    baselineAsset:inputs.baselineAsset,equivalenceAuditSha256:inputs.equivalenceAuditSha256,browser:browserConfig,throttling,
    sourceClock:{sampleCount:80,nominalHz:60,duration:final.duration,actualTimes:'Stored Float32 native-key timestamps',slowedOrResampled:false},
    windows:inputs.windows,captureCount:frames.length,modelLoads:assets.length,camera,cameraSha256,
    sharedAppearance:inputs.sharedAppearance,materialState:materials,geometryAndMorphBasisUnchanged:true,
    controls,glErrors:final.glErrors,contextLosses:final.contextLosses,pairs,frames,errors,warnings,blocked,failedRequests,
    limits:['Exact-seek still sequence, not a real-time performance or smoothness benchmark.',
      'Both clips animate one shared frozen model/basis with one camera and unchanged reviewed material settings.',
      'Only source frames565–577 and604–616 are captured; no full80-frame rerun or additional30-second benchmark.',
      'All52PNGs are actual unedited full-character renderer captures with complete footwear in frame.',
      'Source times are unchanged native60Hz key timestamps; capture wall time does not represent playback speed.',
      'Joint positions and footwear bounds are diagnostic evidence, not independent proof of artistic acceptance.']};
  fs.writeFileSync(path.join(output,'motion75-result.json'),JSON.stringify(report,null,2));
  console.log('MOTION75_RESULT',JSON.stringify(report));
})().catch(async error=>{
  const report={pass:false,error:error.stack,browser:browserConfig,throttling,cold,frames,state:await diagnostics(),errors,warnings,blocked,failedRequests};
  fs.writeFileSync(path.join(output,'motion75-failure.json'),JSON.stringify(report,null,2));console.error('MOTION75_FAILED',JSON.stringify(report));process.exitCode=1;
}).finally(async()=>{await browser?.close();server.close();});
