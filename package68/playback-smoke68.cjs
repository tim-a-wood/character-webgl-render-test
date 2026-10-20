'use strict';
// Bounded actual full-character playback proof. No native source scene or control rig.
// Staged as package68/playback-smoke68.cjs; uses the exact frozen proof-inputs68.json.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),inputs=JSON.parse(fs.readFileSync(path.join(__dirname,'proof-inputs68.json')));
const files=new Map(inputs.localFiles.map(f=>[f.path,f])),allowedExternal=new Set(inputs.externalAssets.map(a=>a.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),check=(ok,message)=>{if(!ok)throw Error(message);};
const cacheControl=process.env.SMOKE_CACHE_CONTROL68||'no-cache';
check(['no-cache','no-store'].includes(cacheControl),'Only explicit comparison cache policies');
check(inputs.mode==='full','Smoke requires the actual full manifest');
for(const f of inputs.localFiles){const file=path.resolve(root,f.path);check(file.startsWith(root+path.sep)&&!fs.lstatSync(file).isSymbolicLink(),'Unsafe frozen file');const b=fs.readFileSync(file);check(b.length===f.bytes&&sha(b)===f.sha256,'Frozen file hash mismatch: '+f.path);}
const output=path.join(__dirname,'proof-results68');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);check(files.has(name),'Not in runtime allowlist');const f=files.get(name),file=path.resolve(root,name);check(file.startsWith(root+path.sep),'Path traversal');const bytes=fs.readFileSync(file);check(bytes.length===f.bytes&&sha(bytes)===f.sha256,'Served bytes changed');res.writeHead(200,{'Content-Type':{'.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.md':'text/plain'}[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':cacheControl});res.end(bytes);}catch(error){res.writeHead(404).end('Not found');}});
let browser,page,started=Date.now();const snapshots=[],blocked=[],errors=[],failures=[],requests=[];
const stamp=()=>({at:new Date().toISOString(),elapsedMs:Date.now()-started});
async function snapshot(label){
 const data=page?await page.evaluate(()=>{const q=window.einarDemoQA68;return {player:q?.getPlayer()?.getState()??null,clock:q?{state:q.clock.getState(),stats:{...q.clock.stats}}:null,scheduler:q?{state:q.scheduler.getState(),stats:{...q.scheduler.stats}}:null,character:q?.getCharacter()?.getState()??null,status:document.getElementById('status')?.textContent,playerStatus:document.getElementById('player-state')?.textContent,playDisabled:document.getElementById('play')?.disabled,visibility:document.visibilityState};}):null;
 const entry={label,...stamp(),data,errors:[...errors],failures:[...failures],blocked:[...blocked]};snapshots.push(entry);console.log('PLAYBACK68_SNAPSHOT',JSON.stringify(entry));return data;
}
(async()=>{
 check(require('playwright-core/package.json').version==='1.57.0','Exact Playwright1.57.0 required');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--use-gl=angle','--use-angle=swiftshader'],timeout:60000});
 const session=await browser.newBrowserCDPSession(),command=await session.send('Browser.getBrowserCommandLine');
 check(!command.arguments.some(a=>['--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--disable-web-security','--ignore-gpu-blocklist','--ignore-certificate-errors'].some(flag=>a===flag||a.startsWith(flag+'='))),'Unsafe browser flags');
 console.log('BROWSER68',JSON.stringify({version:await browser.version(),arguments:command.arguments,sandbox:true,softwareRenderer:true,cacheControl}));
 const context=await browser.newContext({viewport:{width:738,height:480},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).origin===origin||allowedExternal.has(url))return route.continue();blocked.push({url,...stamp()});return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(120000);
 page.on('request',r=>requests.push(r.url()));
 page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText,...stamp()}));
 page.on('pageerror',e=>errors.push({error:e.message,...stamp()}));
 page.on('console',m=>{if(m.type()==='error')errors.push({error:m.text(),...stamp()});});
 page.on('response',r=>{if(r.status()>=400)errors.push({error:'HTTP '+r.status()+' '+r.url(),...stamp()});});
 await page.goto(origin+'/package68/full-demo/index.html?qa68',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'main{grid-template-columns:384px 340px}#viewport{width:384px;height:480px;min-height:480px}'});
 await page.waitForFunction(()=>window.einarDemoQA68);
 const idle=()=>page.evaluate(()=>window.einarDemoQA68.scheduler.whenIdle());await idle();
 check(!requests.some(u=>allowedExternal.has(u)||u.includes('/packed68/')||u.includes('/packed55/')||u.includes('mappings55')),'No eager character or motion fetch');
 await page.locator('#load').click();await page.evaluate(()=>window.einarDemoQA68.load());await idle();
 check(!requests.some(u=>(allowedExternal.has(u)&&/einar-body|body-motion42/.test(u))||/\/packed68\/|\/packed55\/|mappings55/.test(u)),'No eager body/motion fetch during head-only load');
 await page.locator('#load-body').click();await page.evaluate(()=>window.einarDemoQA68.loadBody());await idle();
 const inventory=await page.evaluate(()=>{const q=window.einarDemoQA68,c=q.getCharacter();return {mode:q.config.mode,samples:q.config.frames.length,duration:q.config.duration,head:!!c.root.getObjectByName('RENDER4-GEO-einar_head004'),groom:!!c.root.getObjectByName('Einar24 full source beard scalp lashes'),bodyMeshes:c.metadata.body?.meshes};});
 check(inventory.mode==='full'&&inventory.samples===80&&Math.abs(inventory.duration-1.316693)<1e-12,'Original full sample count and duration');
 check(inventory.head&&inventory.groom&&inventory.bodyMeshes===180,'Original detailed full character inventory');
 const appearance=()=>page.evaluate(()=>{const rows=[];window.einarDemoQA68.getCharacter().root.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material||[]))rows.push({mesh:o.name,name:m.name,type:m.type,uuid:m.uuid,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,opacity:m.opacity,textures:Object.entries(m).filter(([,v])=>v?.isTexture).map(([k,v])=>[k,v.uuid]).sort()});});return rows;});
 const appearanceBefore=await appearance();
 await page.locator('#start-clip').click();await page.evaluate(()=>window.einarDemoQA68.getPlayer().whenReady());await idle();
 const prepared=await snapshot('prepared-at-first-pose');check(prepared.player.time===0&&!prepared.player.playing&&!prepared.player.buffering,'Exact ready start pose');
 check(prepared.player.compressedStore.ready&&prepared.player.compressedStore.verifiedFiles===80,'All 80 source frame blobs verified before Play');
 const ticks=prepared.clock.stats.ticks;
 await page.locator('#play').click();await snapshot('after-pointer-play');
 await page.waitForFunction(ticks=>{const q=window.einarDemoQA68;return q.clock.stats.ticks>ticks&&q.getPlayer().getState().time>0;},ticks,{timeout:45000});
 await page.locator('#pause').click();await page.evaluate(()=>window.einarDemoQA68.getPlayer().whenReady());await idle();
 const paused=await snapshot('after-pointer-pause');check(paused.player.time>0&&!paused.player.playing&&!paused.clock.state.scheduled,'Pointer Pause stops advanced playback');
 const captured=await page.evaluate(async()=>{const q=window.einarDemoQA68;await q.scheduler.whenRendered(q.scheduler.invalidate('playback-smoke-advanced'));const gl=q.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,raw=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(width,height);for(let y=0;y<height;y++)pixels.data.set(raw.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(pixels,0,0);return {base64:canvas.toDataURL('image/jpeg',.95).split(',')[1],width,height,rawSha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join(''),glError:gl.getError(),draws:{...q.renderer.info.render},player:q.getPlayer().getState(),camera:q.camera.position.toArray(),target:q.controls.target.toArray()};});
 check(captured.glError===0&&captured.draws.calls>0&&captured.draws.triangles>0&&captured.player.time>0,'Actual advanced WebGL geometry rendered');
 const base64=captured.base64;delete captured.base64;const jpeg=Buffer.from(base64,'base64');captured.name='einar68-full-playback-advanced';captured.jpegSha256=sha(jpeg);captured.bytes=jpeg.length;captured.mime='image/jpeg';fs.writeFileSync(path.join(output,captured.name+'.jpg'),jpeg);
 console.log('RENDER_IMAGE_BEGIN',JSON.stringify(captured));for(let i=0;i<base64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),base64.slice(i,i+2048));console.log('RENDER_IMAGE_END');
 check(JSON.stringify(await appearance())===JSON.stringify(appearanceBefore),'Original detailed materials and textures unchanged');
 await page.locator('#player-reset').click();await idle();const reset=await snapshot('after-pointer-reset');
 check(reset.player.time===0&&!reset.player.playing&&!reset.player.active&&!reset.clock.state.scheduled,'Reset returns inactive neutral reference and stops clock');
 check(errors.length===0&&failures.length===0&&blocked.length===0,JSON.stringify({errors,failures,blocked}));
 const report={pass:true,kind:'bounded-actual-full-model-playback',...stamp(),cacheControl,inventory,prepared,paused,reset,captured,snapshots,errors,failures,blocked,limitations:['One advanced actual render, not an 80-pose sequence or real-time performance measurement.','No new facial-control regression or exact reset geometry hash; original failed full runs remain failed.','Deterministic clock regression establishes timestamp defect; this smoke does not reproduce the old clock in Chromium.']};
 fs.writeFileSync(path.join(output,'playback-smoke68.json'),JSON.stringify(report,null,2));console.log('PLAYBACK68_RESULT',JSON.stringify(report));
})().catch(async error=>{let snapshotError=null;try{await snapshot('terminal-failure-before-teardown');}catch(e){snapshotError=e.stack;}const report={pass:false,...stamp(),cacheControl,error:error.stack,snapshotError,snapshots,errors,failures,blocked};fs.writeFileSync(path.join(output,'playback-smoke68-failure.json'),JSON.stringify(report,null,2));console.error('PLAYBACK68_FAILED',JSON.stringify(report));process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
