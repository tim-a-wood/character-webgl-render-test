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
  const v=JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8'))[0];
  const model=Buffer.concat(v.files.map(file=>fs.readFileSync(path.join(root,file))));
  if(v.id !== '27' || model.length !== 47647900 || crypto.createHash('sha256').update(model).digest('hex') !== 'e6a03bc8b8f573142e04ac886fe5732b545890cc7559910018aa7e90865d36ee') throw new Error('Unexpected model payload');
  console.log('MODEL_SHA256',v.sha256);
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
  await context.route('**/*',route=>(new URL(route.request().url()).origin===origin || v.body.files.includes(route.request().url())) ? route.continue() : route.abort());
  const page = await context.newPage();
  const bodyResponses=[];page.on('response',r=>{if(v.body.files.includes(r.url()))bodyResponses.push({url:r.url(),status:r.status()});});
  const errors=[];page.on('pageerror', e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});
  page.on('console',msg=>{if(msg.type()==='error'){errors.push(msg.text());console.error('CONSOLE_ERROR',msg.text());}});
  const loadStart=Date.now();
  await page.goto(origin+'/?testViews=1#iteration=27',{waitUntil:'networkidle',timeout:90000});
  await page.addStyleTag({content:'.stage {width:768px;height:960px;min-height:960px} main {grid-template-columns:768px 320px}'});
  try{await page.waitForFunction(()=>window.explorerState?.error || (window.explorerState?.loaded === true && window.explorerState.iteration === '27'),{},{timeout:90000});}catch(e){console.log('LOAD_FAILURE_STATE',JSON.stringify(await page.evaluate(()=>({state:window.explorerState,stage:window.faceLoadStage,status:document.getElementById('status')?.textContent}))));throw e;}
  const loadedState=await page.evaluate(()=>window.explorerState);if(loadedState.error)throw Error('Loader failed: '+JSON.stringify(loadedState));
  const loadToModelReadyMs=Date.now()-loadStart;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  console.log('LOAD_TIMING',JSON.stringify({loadToModelReadyMs,loadToFirstFrameMs:Date.now()-loadStart}));
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
  const captures=[['body-neutral',0,0,false,{}],['body-gesture',1,0,false,{}],['body-gesture-plus45',1,45,false,{}],['face-with-gesture',1,0,true,{jaw:.6,smile:.7}],['body-neutral-restored',0,0,false,{}]];
  let neutralHash;
  for(const [name,gesture,angle,closeup,values] of captures){
    await page.locator('#body-pose').evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('change',{bubbles:true}));},gesture);
    for(const key of ['jaw','smile','brow','blink'])await page.locator('#face-'+key).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},values[key]||0);
    const state=await page.evaluate(()=>({body:window.bodyPoseState(),face:{...window.activeFace26.state},updateMs:window.activeFace26.metadata.lastUpdateMs}));
    if(state.body.weights.length!==14||state.body.weights.some(x=>x.value!==gesture))throw Error('Body control state mismatch');
    const framing=await page.evaluate(x=>window.setBodyFraming(x),closeup);
    const pose=await bounded(page.evaluate(a=>window.setGenericTestYaw(a),angle),'body pose');
    if(Math.abs(pose.cameraDistance-(closeup?v.expectedCameraDistance:Math.hypot(.2,4.4)))>1e-9)throw Error('Body framing changed');
    const readStart=Date.now();const pixels=await bounded(page.evaluate(k=>window.measureGroomPixels(k),name),'body framebuffer');const renderAndReadbackWallMs=Date.now()-readStart;if(pixels.glError)throw Error('Body framebuffer error');
    const base64=await bounded(page.evaluate(k=>window.encodeGroomFrame(k),name),'body frame export');const screenshot=Buffer.from(base64,'base64'),sha256=crypto.createHash('sha256').update(screenshot).digest('hex');
    if(name==='body-neutral')neutralHash=sha256;if(name==='body-neutral-restored'&&sha256!==neutralHash)throw Error('Body neutral framebuffer did not restore exactly');
    console.log('BODY_STATE',JSON.stringify({name,state,framing}));
    console.log('RENDER_IMAGE_BEGIN',JSON.stringify({name,pose,state,framing,renderAndReadbackWallMs,mime:'image/jpeg',bytes:screenshot.length,sha256}));
    for(let i=0;i<base64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),base64.slice(i,i+2048));console.log('RENDER_IMAGE_END');
  }
  console.log('BODY_DELIVERY',JSON.stringify(bodyResponses));if(bodyResponses.length!==12||bodyResponses.some(r=>r.status!==200))throw Error('Body raw chunk delivery incomplete');
  if(errors.length)throw Error('Browser errors: '+errors.join(';'));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
