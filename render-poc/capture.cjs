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
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
  const baseline=new Map(),stateBaseline=new Map(),imageBaseline=new Map(),rawBaseline=new Map(),imageMismatches=[];
  let seed=0x12345678;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.round(seed/4294967296*100)/100;};
  const states=[{jaw:0,smile:0,brow:0,blink:0},{jaw:1,smile:0,brow:0,blink:0},{jaw:0,smile:1,brow:0,blink:0},{jaw:0,smile:0,brow:1,blink:0},{jaw:0,smile:0,brow:0,blink:1},{jaw:.6,smile:.7,brow:.4,blink:.8},{jaw:0,smile:0,brow:0,blink:0}];while(states.length<37)states.push({jaw:rand(),smile:rand(),brow:rand(),blink:rand()});states.push({jaw:0,smile:0,brow:0,blink:0});
  for(const pageLabel of ['37b','38']){const iteration=pageLabel;
  const page = await context.newPage();
  const errors=[];page.on('pageerror', e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});
  page.on('console',msg=>{if(msg.type()==='error'){errors.push(msg.text());console.error('CONSOLE_ERROR',msg.text());}});
  const loadStart=Date.now();
  await page.goto(origin+'/?testViews=1#iteration='+iteration,{waitUntil:'networkidle',timeout:90000});
  await page.addStyleTag({content:'.stage {width:768px;height:960px;min-height:960px} main {grid-template-columns:768px 320px}'});
  try{await page.waitForFunction(id=>window.explorerState?.error || (window.explorerState?.loaded === true && window.explorerState.iteration === id),iteration,{timeout:90000});}catch(e){console.log('LOAD_FAILURE_STATE',JSON.stringify(await page.evaluate(()=>({state:window.explorerState,stage:window.faceLoadStage,status:document.getElementById('status')?.textContent}))));throw e;}
  const loadedState=await page.evaluate(()=>window.explorerState);if(loadedState.error)throw Error('Loader failed: '+JSON.stringify(loadedState));
  const loadToModelReadyMs=Date.now()-loadStart;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  console.log('LOAD_TIMING',JSON.stringify({iteration,loadToModelReadyMs,loadToFirstFrameMs:Date.now()-loadStart}));
  const diagnostics = await page.evaluate(()=>{
    const canvas=document.querySelector('#viewport canvas');
    const gl=canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if(!gl || gl.isContextLost()) throw new Error('WebGL unavailable or lost');
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {...window.explorerState,webgl:true,width:canvas.width,height:canvas.height,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  if (!diagnostics.loaded || diagnostics.meshes < 1) throw new Error('No loaded model');
  console.log('RENDER_DIAGNOSTICS',JSON.stringify(diagnostics));
  const perf=await context.newCDPSession(page);await perf.send('Performance.enable');console.log('MEMORY_METRICS',JSON.stringify(await perf.send('Performance.getMetrics')));
  const bounded=async(promise,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Budget exceeded: '+label+' exceeded60s')),60000);})]);}finally{clearTimeout(timer);}};
  await page.evaluate(()=>window.pauseGenericTestLoop());
  await page.evaluate(()=>window.sceneDiagnostic());
  const prePose=await bounded(page.evaluate(()=>window.setGenericTestYaw(0)),'initial pose');
  await bounded(page.evaluate(()=>window.measureGroomPixels('pre-canonical')),'initial frame');
  const preRaw=Buffer.from(await page.evaluate(()=>window.rawFrameBase64('pre-canonical')),'base64');
  const preDraws=await page.evaluate(()=>window.drawOrderDiagnostic);await page.evaluate(()=>{window.drawOrderDiagnostic=[];});
  const canonicalOrder=await page.evaluate(()=>window.enableCanonicalOpaqueOrder());
  const freshPose=await bounded(page.evaluate(()=>window.setGenericTestYaw(0)),'fresh neutral pose');
  await bounded(page.evaluate(()=>window.measureGroomPixels('fresh-neutral')),'fresh neutral frame');
  const freshRaw=Buffer.from(await page.evaluate(()=>window.rawFrameBase64('fresh-neutral')),'base64');
  const freshSha=crypto.createHash('sha256').update(freshRaw).digest('hex');
  let changed=0;for(let i=0;i<freshRaw.length;i+=4)if(freshRaw[i]!==preRaw[i]||freshRaw[i+1]!==preRaw[i+1]||freshRaw[i+2]!==preRaw[i+2])changed++;
  console.log('CANONICAL_ORDER',JSON.stringify({pageLabel,canonicalOrder,preSha256:crypto.createHash('sha256').update(preRaw).digest('hex'),rawSha256:freshSha,changedPixelsFromDefault:changed,pose:freshPose,preDraws,canonicalDraws:await page.evaluate(()=>window.drawOrderDiagnostic)}));
  const mi=await page.evaluate(()=>window.moustacheInvariant38());console.log('MOUSTACHE_INITIAL',JSON.stringify(mi));if(iteration==='38'){if(mi.metadata.sourceCurves!==7566||mi.metadata.sourcePoints!==75660||mi.triangles!==129516)throw Error('Moustache source counts');for(let k=0;k<3;k++)if(mi.centerlineBounds[0][k]<v.expectedBounds[0][k]||mi.centerlineBounds[1][k]>v.expectedBounds[1][k])throw Error('Moustache outside source head bounds');}
  await bounded(page.evaluate(()=>window.measureGroomPixels('fresh-repeat')),'fresh repeat');const repeat=Buffer.from(await page.evaluate(()=>window.rawFrameBase64('fresh-repeat')),'base64');if(!repeat.equals(freshRaw))throw Error('Canonical same-state repeat mismatch');
  console.log('FRESH_NEUTRAL',JSON.stringify({pageLabel,iteration,rawSha256:freshSha,pose:freshPose}));
  if(pageLabel==='36-control'){if(errors.length)throw Error(errors.join(';'));await page.close();continue;}
  const neutralDigest=await page.evaluate(()=>window.faceGeometryDigest()),mustacheInitial=await page.evaluate(()=>window.moustacheInvariant38());
  for(let i=0;i<states.length;i++){
    const actual=await page.evaluate(v=>window.activeFace26.setExpressions(v),states[i]);for(const k of Object.keys(states[i]))if(actual[k]!==states[i][k])throw Error('Seeded state mismatch');
    const digest=await page.evaluate(()=>window.faceGeometryDigest());if(iteration==='37b')stateBaseline.set(i,digest);else if(JSON.stringify(digest.filter(x=>!x.name.startsWith('Einar38 authored moustache:')))!==JSON.stringify(stateBaseline.get(i)))throw Error('Sparse state parity failure '+i);if(iteration==='38'){const m=await page.evaluate(()=>window.moustacheInvariant38());if(m.sha256!==mustacheInitial.sha256)throw Error('Moustache width/colour/alpha changed');}console.log('STATE_PARITY',JSON.stringify({iteration,index:i,state:states[i],digest,matched:iteration==='38'}));
  }
  const cpu=await bounded(page.evaluate(()=>{
    const zero={jaw:0,smile:0,brow:0,blink:0},out={};for(const channel of ['zero','jaw','smile','brow','blink','jawSmile','mixed']){const samples=[],moustacheSamples=[];for(let i=0;i<30;i++){const q=.1+(i%9)*.1,values={...zero};if(channel==='jawSmile'){values.jaw=q;values.smile=1-q;}else if(channel==='mixed'){values.jaw=q;values.smile=.73;values.brow=.31;values.blink=.62;}else if(channel!=='zero')values[channel]=q;const t=performance.now();window.activeFace26.setExpressions(values);const ms=performance.now()-t;if(i>=5){samples.push(ms);moustacheSamples.push(window.activeFace26.metadata.moustache38?.lastUpdateMs||0);}}const sorted=[...samples].sort((a,b)=>a-b);out[channel]={warmups:5,samples,moustacheSamples,moustacheMedianMs:[...moustacheSamples].sort((a,b)=>a-b)[12],medianMs:sorted[12],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]};}return {cases:out,sparseMemory:window.activeFace26.metadata.sparseGroom37||null,measured:'synchronous full setExpressions call; excludes rendering, digest, input dispatch'};
  }),'CPU benchmark');console.log('CPU_BENCHMARK',JSON.stringify({iteration,...cpu}));
  const burst=await page.evaluate(()=>{const states=[{jaw:1,smile:0,brow:0,blink:0},{jaw:0,smile:0,brow:1,blink:1},{jaw:.6,smile:.7,brow:.2,blink:.3}];let events=0;const start=performance.now();for(const values of states)for(const [k,v]of Object.entries(values)){const el=document.getElementById('face-'+k);el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));events++;}return {events,dispatchAndCpuMs:performance.now()-start,state:{...window.activeFace26.state}};});const burstDigest=await page.evaluate(()=>window.faceGeometryDigest());if(iteration==='37b')stateBaseline.set('burst',burstDigest);else if(JSON.stringify(burstDigest.filter(x=>!x.name.startsWith('Einar38 authored moustache:')))!==JSON.stringify(stateBaseline.get('burst')))throw Error('Burst final geometry mismatch');for(const [k,v]of Object.entries({jaw:.6,smile:.7,brow:.2,blink:.3}))if(burst.state[k]!==v)throw Error('Burst final state mismatch');console.log('EVENT_BURST',JSON.stringify({iteration,...burst}));

  for(const [key,value] of Object.entries({jaw:.13,smile:.27,brow:.38,blink:.42}))await page.locator('#face-'+key).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const eventState=await page.evaluate(()=>({...window.activeFace26.state}));for(const [key,value]of Object.entries({jaw:.13,smile:.27,brow:.38,blink:.42}))if(eventState[key]!==value)throw Error('Live input mismatch '+key);console.log('CONTROL_EVENTS',JSON.stringify({iteration,state:eventState}));
  const poses=[['front',{},0],['yaw45',{},45],['glancing75',{},75],['jaw',{jaw:1},0],['smile',{smile:1},0],['heldout',{jaw:.37,smile:.61},30],['fourway',{jaw:.23,smile:.81,brow:.17,blink:.91},0],['neutral-restored',{},0]];let firstHash;
  for(const [view,values,angle] of poses){
    for(const key of ['jaw','smile','brow','blink'])await page.locator('#face-'+key).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},values[key]||0);
    const digest=await page.evaluate(()=>window.faceGeometryDigest());if(view==='neutral-restored'&&JSON.stringify(digest)!==JSON.stringify(neutralDigest))throw Error('Neutral attributes changed');
    const state=await page.evaluate(()=>({state:{...window.activeFace26.state},metadata:window.activeFace26.metadata}));
    const pose=await bounded(page.evaluate(a=>window.setGenericTestYaw(a),angle),'pose');if(Math.abs(pose.cameraDistance-v.expectedCameraDistance)>1e-9)throw Error('Framing changed');
    const groom=pose.materials.find(m=>m.mesh==='Einar24 full source beard scalp lashes');if(!groom||!groom.alphaHash||groom.alphaToCoverage||groom.transparent||!groom.depthWrite)throw Error('Groom material baseline changed');if(!groom.fiberNormal36)throw Error('36 shader not compiled');
    const compare={digest:digest.filter(x=>!x.name.startsWith('Einar38 authored moustache:')),groomPhysical:Object.fromEntries(['transparent','depthWrite','alphaTest','alphaHash','alphaToCoverage','blending','roughness','metalness','side','vertexColors'].map(k=>[k,groom[k]])),triangles:pose.rendererTriangleDraws-(iteration==='38'?259032:0),calls:pose.rendererDrawCalls-(iteration==='38'?2:0),camera:pose.cameraPosition,target:pose.cameraTarget,projectionMatrix:pose.projectionMatrix,modelMatrixWorld:pose.modelMatrixWorld,canvas:[pose.canvasWidth,pose.canvasHeight]};if(iteration==='37b')baseline.set(view,compare);else if(JSON.stringify(compare)!==JSON.stringify(baseline.get(view)))throw Error('36/37 geometry, draw count or framing mismatch '+view);
    const name='einar'+iteration+'-'+view,started=Date.now();const pixels=await bounded(page.evaluate(k=>window.measureGroomPixels(k),name),'framebuffer');if(pixels.glError)throw Error('GL error');const renderAndReadbackWallMs=Date.now()-started;
    const base64=await bounded(page.evaluate(k=>window.encodeGroomFrame(k),name),'framebuffer export'),screenshot=Buffer.from(base64,'base64'),sha256=crypto.createHash('sha256').update(screenshot).digest('hex');if(iteration==='37b')imageBaseline.set(view,sha256);if(view==='front')firstHash=sha256;if(view==='neutral-restored'&&sha256!==firstHash)throw Error('Neutral image mismatch');
    const raw=Buffer.from(await page.evaluate(k=>window.rawFrameBase64(k),name),'base64');if(view==='front'&&!raw.equals(freshRaw))throw Error('Fresh neutral differs after state transitions');if(iteration==='37b')rawBaseline.set(view,raw);else{const base=rawBaseline.get(view);let changed=0,max=0,total=0,minX=Infinity,minY=Infinity,maxX=-1,maxY=-1;for(let i=0;i<raw.length;i+=4){let pixel=false;for(let c=0;c<3;c++){const d=Math.abs(raw[i+c]-base[i+c]);if(d)pixel=true;max=Math.max(max,d);total+=d;}if(pixel){changed++;const x=(i/4)%pose.canvasWidth,y=pose.canvasHeight-1-Math.floor(i/4/pose.canvasWidth);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}console.log('RAW_PIXEL_PARITY',JSON.stringify({view,bytes:raw.length,rawSha256:crypto.createHash('sha256').update(raw).digest('hex'),baselineRawSha256:crypto.createHash('sha256').update(base).digest('hex'),changedPixels:changed,maxChannelDelta:max,meanAbsRGB:total/(raw.length/4*3),changedBounds:changed?[minX,minY,maxX,maxY]:null}));}
    if(iteration==='38'&&view==='front'){await page.evaluate(()=>window.hideMoustache38(true));await page.evaluate(()=>window.measureGroomPixels('hidden38'));const hidden=Buffer.from(await page.evaluate(()=>window.rawFrameBase64('hidden38')),'base64');await page.evaluate(()=>window.hideMoustache38(false));if(!hidden.equals(rawBaseline.get('front')))throw Error('Moustache hidden base pixels changed');console.log('HIDDEN_BASE_PARITY',true);}if(iteration==='38'){const m=pose.materials.find(x=>x.mesh==='Einar38 authored moustache');if(!m||!m.fiberNormal36||!m.alphaHash||m.transparent||!m.depthWrite)throw Error('Moustache shader flags');}console.log('SHADING_COMPARE',JSON.stringify({iteration,view,state,geometryMatched:iteration==='38',compare}));
    console.log('RENDER_IMAGE_BEGIN',JSON.stringify({name,iteration,view,pose,state:state.state,renderAndReadbackWallMs,mime:'image/jpeg',bytes:screenshot.length,sha256}));for(let i=0;i<base64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),base64.slice(i,i+2048));console.log('RENDER_IMAGE_END');
  }
  if(errors.length)throw Error('Browser errors: '+errors.join(';'));
  await page.close();
  }
  if(imageMismatches.length)throw Error('Exact image parity failed: '+imageMismatches.join(','));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});

