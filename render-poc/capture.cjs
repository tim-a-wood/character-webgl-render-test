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
  const v=JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8'))[0];
  const model=Buffer.concat(v.files.map(file=>fs.readFileSync(path.join(root,file))));
  if(v.id!=='33'||model.length!==29312456||crypto.createHash('sha256').update(model).digest('hex')!=='62ea66074d27060a6b93e951c9539fb4822f6439f237e105bb65b35b4a787834')throw Error('Rain model hash');
  for(const [file,sha] of [['assets/rain-face33b.js',v.rain.moduleSha256],[v.rain.url,v.rain.sha256],[v.rain.manifestUrl,v.rain.manifestSha256]])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==sha)throw Error('Rain component hash '+file);
  console.log('MODEL_SHA256',v.sha256);
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
  await context.route('**/*',route=>(new URL(route.request().url()).origin===origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors=[];page.on('pageerror', e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});
  page.on('console',msg=>{if(msg.type()==='error'){errors.push(msg.text());console.error('CONSOLE_ERROR',msg.text());}});
  const loadStart=Date.now();
  await page.goto(origin+'/?testViews=1#iteration=33',{waitUntil:'networkidle',timeout:90000});
  await page.addStyleTag({content:'.stage {width:768px;height:960px;min-height:960px} main {grid-template-columns:768px 320px}'});
  try{await page.waitForFunction(()=>window.explorerState?.error || (window.explorerState?.loaded === true && window.explorerState.iteration === '33'),{},{timeout:90000});}catch(e){console.log('LOAD_FAILURE_STATE',JSON.stringify(await page.evaluate(()=>({state:window.explorerState,stage:window.faceLoadStage,status:document.getElementById('status')?.textContent}))));throw e;}
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
  const neutralDigest=await page.evaluate(()=>window.faceGeometryDigest());
  const captures=[['neutral',{},0],['jaw',{jaw:1},0],['smile',{smile:1},0],['brow',{brow:1},0],['blink',{blink:1},0],['nearclosure',{blink:.91,brow:.17},0],['fourway',{jaw:.23,smile:.81,blink:.91,brow:.17},0],['jaw-smile-oblique',{jaw:.6,smile:.7},30],['neutral-restored',{},0]];
  let neutralHash;
  for(const [name,values,angle] of captures){
    for(const key of ['jaw','smile','brow','blink'])await page.locator('#face-'+key).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},values[key]||0);
    const state=await page.evaluate(()=>({state:{...window.activeFace26.state},metadata:window.activeFace26.metadata,controls:Array.from(document.querySelectorAll('#face-controls input')).map(x=>({id:x.id,value:x.value}))}));
    for(const key of ['jaw','smile','brow','blink'])if(state.state[key] !== (values[key]||0))throw Error('Control event mismatch '+key);
    const digest=await page.evaluate(()=>window.faceGeometryDigest());if(name==='neutral-restored'&&JSON.stringify(digest)!==JSON.stringify(neutralDigest))throw Error('Neutral geometry/normals did not restore exactly');
    const pose=await bounded(page.evaluate(a=>window.setGenericTestYaw(a),angle),'Rain pose');if(Math.abs(pose.cameraDistance-v.expectedCameraDistance)>1e-9)throw Error('Rain camera changed');
    const readStart=Date.now(),pixels=await bounded(page.evaluate(k=>window.measureGroomPixels(k),name),'Rain framebuffer');if(pixels.glError)throw Error('Rain framebuffer error');const renderAndReadbackWallMs=Date.now()-readStart;
    const base64=await bounded(page.evaluate(k=>window.encodeGroomFrame(k),name),'Rain export');const screenshot=Buffer.from(base64,'base64'),sha256=crypto.createHash('sha256').update(screenshot).digest('hex');
    if(name==='neutral')neutralHash=sha256;if(name==='neutral-restored'&&sha256!==neutralHash)throw Error('Rain neutral pixels did not restore exactly');
    console.log('EXPRESSION_STATE',JSON.stringify({name,...state,digest}));
    console.log('RENDER_IMAGE_BEGIN',JSON.stringify({name,pose,state:state.state,renderAndReadbackWallMs,mime:'image/jpeg',bytes:screenshot.length,sha256}));
    for(let i=0;i<base64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),base64.slice(i,i+2048));console.log('RENDER_IMAGE_END');
  }
  if(errors.length)throw Error('Browser errors: '+errors.join(';'));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});

