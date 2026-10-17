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
  const v=JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8'))[0];
  const model=Buffer.concat(v.files.map(file=>fs.readFileSync(path.join(root,file))));
  if(v.id !== '17' || model.length !== 33451932 || crypto.createHash('sha256').update(model).digest('hex') !== '4cbe74db46e47a2b816d2c126481cec273972c65bfd0d544939d73bf78065d2a') throw new Error('Unexpected model payload');
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
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', e=>console.error('PAGE_ERROR',e.message));
  page.on('console',msg=>{if(msg.type()==='error')console.error('CONSOLE_ERROR',msg.text());});
  const loadStart=Date.now();
  await page.goto(origin+'/?testViews=1#iteration=17',{waitUntil:'networkidle',timeout:90000});
  await page.addStyleTag({content:'.stage {width:768px;height:960px;min-height:960px} main {grid-template-columns:768px 320px}'});
  await page.waitForFunction(()=>window.explorerState?.loaded === true && window.explorerState.iteration === '17',{},{timeout:90000});
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
  const views=[['front',0],['yaw-minus45',-45],['yaw-plus45',45],['glancing-plus75',75],['glancing-minus75',-75]];
  for(const [name,angle] of views){
    const pose=await page.evaluate(angle=>window.setGenericTestYaw(angle),angle);
    if(Math.abs(pose.cameraDistance-0.6493779318136598)>1e-9)throw new Error('Camera framing differs from09 baseline');
    const twoFrameWaitMs=await page.evaluate(()=>new Promise(resolve=>{const t=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-t)));}));
    const captureStart=Date.now();
    const screenshot = await page.locator('#viewport canvas').screenshot({type:'jpeg',quality:95});
    if (screenshot.length > 750000) throw new Error('Screenshot exceeds bounded log payload');
    fs.writeFileSync(path.join(__dirname,name+'.jpg'),screenshot);
    const base64=screenshot.toString('base64');
    console.log('RENDER_IMAGE_BEGIN',JSON.stringify({name,pose,twoFrameWaitMs,screenshotWallMs:Date.now()-captureStart,mime:'image/jpeg',bytes:screenshot.length,sha256:crypto.createHash('sha256').update(screenshot).digest('hex'),chunks:Math.ceil(base64.length/2048)}));
    for(let i=0;i<base64.length;i+=2048) console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),base64.slice(i,i+2048));
    console.log('RENDER_IMAGE_END');
  }
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
