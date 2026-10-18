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


  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/einar-skin40b.js'))).digest('hex')!=='12aa5aede6270c2ae317d7674856697679eb7d1f7431d107e06fb7ae0efab2b3')throw Error('Skin40 module hash');
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error('CONSOLE_ERROR',m.text());}});
  const bounded=async(p,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' exceeded60s')),60000);})]);}finally{clearTimeout(timer);}};
  await page.goto(origin+'/?testViews=1#iteration=38',{waitUntil:'networkidle',timeout:90000});await page.addStyleTag({content:'.stage {width:768px;height:960px;min-height:960px} main {grid-template-columns:768px 320px}'});
  await page.waitForFunction(()=>window.explorerState?.error||window.explorerState?.loaded,{},{timeout:90000});const state=await page.evaluate(()=>window.explorerState);if(state.error)throw Error(JSON.stringify(state));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(()=>window.pauseGenericTestLoop());await page.evaluate(()=>window.enableCanonicalOpaqueOrder());
  const geometry=await page.evaluate(()=>window.faceGeometryDigest());let reference;const mismatches=[];await page.evaluate(()=>window.observeTransmissionClear40());
  for(const mode of ['original','historical','zero','zero-repeat']){
   if(mode==='historical')console.log('SKIN40_INSTALL',JSON.stringify(await page.evaluate(()=>window.installSkinTest40())));
   if(mode!=='original')await page.evaluate(m=>window.skinTest40.setMode(m==='zero-repeat'?'zero':m),mode);
   const pose=await bounded(page.evaluate(()=>window.setGenericTestYaw(0)),'pose'),name='einar40b-'+mode,start=Date.now();
   const pixels=await bounded(page.evaluate(k=>window.measureGroomPixels(k),name),'framebuffer'),wall=Date.now()-start;
   const metadata=await page.evaluate(()=>window.skinTest40?.metadata||null);console.log('SKIN40_METADATA',JSON.stringify({mode,metadata,readError:pixels.glError}));
   const raw=Buffer.from(await page.evaluate(k=>window.rawFrameBase64(k),name),'base64');if(!reference)reference=raw;let changed=0,total=0,max=0,minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,channelMax=[0,0,0,0];for(let i=0;i<raw.length;i+=4){let d=false;for(let c=0;c<4;c++){const v=Math.abs(raw[i+c]-reference[i+c]);total+=v;max=Math.max(max,v);channelMax[c]=Math.max(channelMax[c],v);if(v)d=true;}if(d){changed++;const x=(i/4)%pose.canvasWidth,y=pose.canvasHeight-1-Math.floor(i/4/pose.canvasWidth);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
   console.log('ZERO_PARITY',JSON.stringify({mode,changedPixels:changed,maxChannelDelta:max,channelMax,changedBounds:changed?[minX,minY,maxX,maxY]:null,meanAbsRGBA:total/raw.length,rawSha256:crypto.createHash('sha256').update(raw).digest('hex')}));
   const base64=await page.evaluate(k=>window.encodeGroomFrame(k),name),bytes=Buffer.from(base64,'base64'),sha256=crypto.createHash('sha256').update(bytes).digest('hex');console.log('RENDER_IMAGE_BEGIN',JSON.stringify({name,mode,pose,metadata,renderAndReadbackWallMs:wall,bytes:bytes.length,sha256,mime:'image/jpeg'}));for(let i=0;i<base64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),base64.slice(i,i+2048));console.log('RENDER_IMAGE_END');
   if(errors.length)throw Error('Shader/browser errors: '+errors.join(';'));if(pixels.glError||metadata?.glError)throw Error('GL error');if(JSON.stringify(await page.evaluate(()=>window.faceGeometryDigest()))!==JSON.stringify(geometry))throw Error('Skin40 geometry changed');if(changed)mismatches.push(mode);if(mode.startsWith('zero')&&(metadata.actualSamples!==4||metadata.sampleBuffers!==1||metadata.framebufferStatus!==36053))throw Error('Skin40 sample/framebuffer gate');
  }
  console.log('ORIGINAL_TRANSMISSION_CLEAR',JSON.stringify(await page.evaluate(()=>window.originalTransmissionClear40)));if(mismatches.length)throw Error('Skin40b raw equality failed '+mismatches.join(','));console.log('SKIN40_ZERO_GATE_PASSED',true);
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
