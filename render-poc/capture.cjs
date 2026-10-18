'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, 'site');
const type = {'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.css':'text/css','.wasm':'application/wasm'};
const server = http.createServer((req,res) => {
  try {
    const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
    const stat = fs.statSync(file);
    if (!stat.isFile()) {res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':type[path.extname(file)] || 'application/octet-stream','Content-Length':stat.size});
    fs.createReadStream(file).pipe(res);
  } catch {res.writeHead(404).end();}
});
let browser;
(async () => {
  if (require('playwright-core/package.json').version !== '1.57.0') throw new Error('Unexpected Playwright version');
  const patch=JSON.parse(fs.readFileSync(path.join(__dirname,'header17.json'),'utf8'));
  const base=Buffer.concat([0,1,2,3].map(i=>fs.readFileSync(path.join(root,'assets/benchmark-09-'+i+'.bin'))));
  if(crypto.createHash('sha256').update(base).digest('hex')!==patch.baseSha256)throw Error('Base model hash mismatch');
  fs.writeFileSync(path.join(root,'assets/benchmark-17.glb'),Buffer.concat([Buffer.from(patch.headerBase64,'base64'),base.subarray(patch.baseOffset),fs.readFileSync(path.join(root,'assets/benchmark-17-append.bin'))]));
  const patch18=JSON.parse(fs.readFileSync(path.join(__dirname,'header18.json'),'utf8'));
  const base17=fs.readFileSync(path.join(root,'assets/benchmark-17.glb'));
  if(crypto.createHash('sha256').update(base17).digest('hex')!==patch18.baseSha256)throw Error('Model17 hash mismatch');
  fs.writeFileSync(path.join(root,'assets/benchmark-18.glb'),Buffer.concat([Buffer.from(patch18.headerBase64,'base64'),base17.subarray(patch18.baseOffset),...([0,1].map(i=>fs.readFileSync(path.join(root,'assets/benchmark-18-append-'+i+'.bin'))))]));
  const v=JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8')).find(x=>x.id==='26');
  const model=Buffer.concat(v.files.map(file=>fs.readFileSync(path.join(root,file))));
  if(v.id !== '26' || model.length !== 47647900 || crypto.createHash('sha256').update(model).digest('hex') !== 'e6a03bc8b8f573142e04ac886fe5732b545890cc7559910018aa7e90865d36ee') throw new Error('Unexpected model payload');
  console.log('MODEL_SHA256',v.sha256);for(const [name,sha]of [['einar-moustache38.js', '91b0e615e6db98c808e2cfdacdf14396884a011a355560c58f6a9be1efa88f22'], ['moustache-motion38.js', 'a6b73a0cd830dbd4e1c6480de5debee51ba2f6161285611abe09c62c60cf11da'], ['einar-moustache38.bin.gz', 'e35827cea6e6674f18b75f08b6ad67295f51c9be11baf9b327aceee9ff854d9b'], ['einar-moustache-motion38.bin.gz', '91c73cac5664bba77d8cb3fdf6f26483142504f3d05caafa3dd52844d2327212']])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets',name))).digest('hex')!==sha)throw Error('38 hash mismatch '+name);
  for(const [name,sha]of [['einar-face37b.js','caa8da17e80b4abc777a42ce0430609e0d2c6e25c60a7e7631a579a5f8cd9c41'],['hybrid-groom37b.js','af19e13a84987108593c3a101954485852b87e3ae58c7507262ea5a43330369e']])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets',name))).digest('hex')!==sha)throw Error('37 module hash '+name);
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/einar-groom36.js'))).digest('hex')!=='48db997d0bf0b42d014d39e4e3fc9d073b2f9977fdb32fb515f1085e1af5e8f5')throw Error('36 module hash');
  for(const [file,sha] of [['assets/einar-face26b.js','f807edda945c99ad079343991367748f84c05ad228d3278a20c1656d1a6ae272'],[v.face.url,v.face.compressedSha256],[v.face.oral,'a0615d3c5fe106644fc7c950b83b0131e4cbe4f91d69eb755a29bac5ecabc597']])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==sha)throw Error('Face asset hash mismatch '+file);
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/einar-groom24.js'))).digest('hex')!==v.runtimePatch.moduleSha256)throw Error('Module hash mismatch');
  const compressed=Buffer.concat(v.runtimePatch.files.map(f=>fs.readFileSync(path.join(root,f))));if(crypto.createHash('sha256').update(compressed).digest('hex')!==v.runtimePatch.compressedSha256)throw Error('Compressed groom hash mismatch');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--use-gl=angle','--use-angle=swiftshader'],timeout:60000});
  const session = await browser.newBrowserCDPSession();
  const {arguments: args} = await session.send('Browser.getBrowserCommandLine');
  const forbidden = ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--disable-web-security','--ignore-gpu-blocklist'];
  if (args.some(arg => forbidden.some(flag => arg === flag || arg.startsWith(flag+'=')))) throw new Error('Forbidden launch flag');
  console.log('BROWSER', await browser.version());
  console.log('LAUNCH_ARGUMENTS',JSON.stringify(args));
  const context = await browser.newContext({viewport:{width:1400,height:1300},deviceScaleFactor:1,serviceWorkers:'block'});


  for(const [name,sha]of [['viewer-milestone41.js','f6eff5016ffe0b25970ed876044311c39734d1f8e0f8d9618b19628f68ea953d'],['demand-render41.js','e41517f5ac8b9a3309382d4597f3086952990524fdb96c190c909dbdd54bac69']])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets',name))).digest('hex')!==sha)throw Error('Milestone41 module hash '+name);
  const allowedBody=JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8')).find(v=>v.id==='41').deferredBody.files;
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin||allowedBody.includes(route.request().url())?route.continue():route.abort());
  const page=await context.newPage(),errors=[],bodyRequests=[];page.on('request',r=>{if(allowedBody.includes(r.url()))bodyRequests.push({url:r.url(),method:r.method(),referer:r.headers().referer||null});});page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});page.on('console',m=>{if(m.text().startsWith('RESIZE_REQUEST41'))console.log(m.text());if(m.type()==='error'){errors.push(m.text());console.error('CONSOLE_ERROR',m.text());}});
  const bounded=async(p,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' exceeded90s')),90000);})]);}finally{clearTimeout(timer);}};
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const idle=()=>bounded(page.evaluate(()=>window.milestone41.scheduler.whenIdle()),'demand settle');
  const capture=async(name)=>{const start=Date.now(),m=await bounded(page.evaluate(()=>window.captureMilestone41()),'demand capture');check(m.glError===0,'GL error');const bytes=Buffer.from(m.base64,'base64'),base64=m.base64;delete m.base64;console.log('RENDER_IMAGE_BEGIN',JSON.stringify({name,...m,wallMs:Date.now()-start,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),mime:'image/jpeg'}));for(let i=0;i<base64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),base64.slice(i,i+2048));console.log('RENDER_IMAGE_END');return m;};
  const idleGate=async(label)=>{await idle();const a=await page.evaluate(()=>window.milestone41.scheduler.stats.frames);await page.waitForTimeout(700);const b=await page.evaluate(()=>({...window.milestone41.scheduler.stats}));check(a===b.frames,'Unexpected idle draws '+label);console.log('IDLE41',JSON.stringify({label,idleDraws:b.frames-a,stats:b}));};
  await page.goto(origin+'/?testViews=1#iteration=41',{waitUntil:'domcontentloaded',timeout:90000});await page.addStyleTag({url:origin+'/assets/viewer-milestone41.css'});await page.addStyleTag({content:'.stage {width:768px;height:960px;min-height:960px} main {grid-template-columns:768px 320px}'});
  await page.waitForFunction(()=>window.explorerState?.error||window.explorerState?.loaded,{},{timeout:90000});const state=await page.evaluate(()=>window.explorerState);check(!state.error,JSON.stringify(state));await idle();check(bodyRequests.length===0,'Body fetched during head load');
  check(bodyRequests.length===0,'Eager body fetch');await page.locator('#load-body41').click();await bounded(page.evaluate(()=>window.milestone41.ensureBody()),'body load');await idle();const baseGeometry=await page.evaluate(()=>window.faceGeometryDigest());const original=await capture('einar41-completion-body-neutral');const baseCamera=await page.evaluate(()=>window.milestoneCamera41());
  await page.locator('#body-pose41').selectOption('1');await page.evaluate(()=>{for(const[k,v]of Object.entries({jaw:.6,smile:.7,brow:.17,blink:.3})){const el=document.getElementById('face41-'+k);el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));}});await idle();check((await page.evaluate(()=>window.milestone41.getBody().targets.map(t=>t.mesh.morphTargetInfluences[t.index]))).every(x=>x===1),'Gesture endpoint');await page.locator('#head-view41').click();await idle();check((await page.evaluate(()=>window.milestone41.state.view))==='head','Head view');
  await page.locator('#preset41-neutral').click();await page.locator('#body-pose41').selectOption('0');await page.locator('#body-view41').click();await idle();await idleGate('body reset');check((await page.evaluate(()=>window.milestone41.getBody().targets.map(t=>t.mesh.morphTargetInfluences[t.index]))).every(x=>x===0),'Body reset');check(JSON.stringify(await page.evaluate(()=>window.faceGeometryDigest()))===JSON.stringify(baseGeometry),'Exact neutral geometry');check(JSON.stringify(await page.evaluate(()=>window.milestoneCamera41()))===JSON.stringify(baseCamera),'Exact body framing reset');const restored=await capture('einar41-completion-body-reset');check(restored.rawSha256===original.rawSha256,'Exact body reset raw pixels');await page.evaluate(()=>window.milestone41.ensureBody());check(bodyRequests.length===12&&new Set(bodyRequests.map(x=>x.url)).size===12,'Body download count/cache');check(errors.length===0,'Browser errors '+errors.join(';'));console.log('MILESTONE41_COMPLETION_PASSED',JSON.stringify({bodyRequests:bodyRequests.length,rawResetExact:true,geometryResetExact:true,framingResetExact:true,errors,body:await page.evaluate(()=>window.milestone41.getBody().metadata),stats:await page.evaluate(()=>window.milestone41.scheduler.stats)}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
