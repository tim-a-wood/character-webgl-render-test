'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');process.env.DEBUG='pw:browser';
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package46/manifest.json'))),allowed=new Set(manifest.assetInventory.map(x=>x.url));
const server=http.createServer((req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('path');const b=fs.readFileSync(file),ext=path.extname(file);res.writeHead(200,{'Content-Type':{'.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.wasm':'application/wasm'}[ext]||'application/octet-stream','Content-Length':b.length});res.end(b);}catch{res.writeHead(404).end();}});
let browser;
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
(async()=>{
 check(require('playwright-core/package.json').version==='1.57.0','Runtime version');await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--use-gl=angle','--use-angle=swiftshader'],timeout:60000});
 const session=await browser.newBrowserCDPSession(),{arguments:args}=await session.send('Browser.getBrowserCommandLine');check(!args.some(a=>['--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--disable-web-security','--ignore-gpu-blocklist'].some(f=>a===f||a.startsWith(f+'='))),'Unsafe flags');console.log('BROWSER',await browser.version());console.log('LAUNCH_ARGUMENTS',JSON.stringify(args));
 for(const[name,sha]of Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname,'capture62-full-hashes.json')))))check(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')===sha,'Frozen hash '+name);
 const context=await browser.newContext({viewport:{width:738,height:480},deviceScaleFactor:1,serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin||allowed.has(r.request().url())?r.continue():r.abort());
 const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error('CONSOLE_ERROR',m.text());}});page.on('request',r=>{if(allowed.has(r.url()))requests.push(r.url());});
 await page.goto(origin+'/package62/full-demo/index.html?qa62',{waitUntil:'domcontentloaded'});await page.addStyleTag({content:'main{grid-template-columns:384px 340px}#viewport{width:384px;height:480px;min-height:480px}'});await page.waitForFunction(()=>window.einarDemoQA62);
 const idle=()=>page.evaluate(()=>window.einarDemoQA62.scheduler.whenIdle());await idle();check(requests.length===0,'Eager assets before explicit load');
 const empty=await page.evaluate(()=>({...window.einarDemoQA62.renderer.info.memory}));
 await page.locator('#load').click();await page.evaluate(()=>window.einarDemoQA62.load());await idle();
 check(!requests.some(x=>/einar-body|body-motion42/.test(x)),'Eager body or motion fetch');
 const digest=()=>page.evaluate(async()=>{const a=[],root=window.einarDemoQA62.getCharacter().root;root.traverse(o=>{if(!o.isMesh)return;for(const[k,v]of Object.entries(o.geometry.attributes)){const ar=v.isInterleavedBufferAttribute?v.data.array:v.array;a.push([o.name,k,new Uint8Array(ar.buffer,ar.byteOffset,ar.byteLength)]);}});const out=[];for(const[n,k,b]of a)out.push([n,k,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('')]);return out.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));});
 const capture=async (name,phase=null,exactTime=null)=>{const m=await page.evaluate(async({phase,exactTime})=>{const q=window.einarDemoQA62;if(phase!==null||exactTime!==null){q.clock.seek(exactTime!==null?exactTime:phase*q.getPlayer().getState().duration);await q.getPlayer().whenReady();}await q.scheduler.whenRendered(q.scheduler.invalidate('qa-capture'));const gl=q.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),data=ctx.createImageData(w,h);for(let y=0;y<h;y++)data.data.set(a.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);ctx.putImageData(data,0,0);return {base64:c.toDataURL('image/jpeg',.95).split(',')[1],rawSha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join(''),width:w,height:h,glError:gl.getError(),camera:q.camera.position.toArray(),target:q.controls.target.toArray(),memory:{...q.renderer.info.memory},draws:{...q.renderer.info.render},state:q.getCharacter().getState(),player:q.getPlayer()?.getState()};},{phase,exactTime});check(m.glError===0,'GL error');const b64=m.base64;delete m.base64;const bytes=Buffer.from(b64,'base64');console.log('RENDER_IMAGE_BEGIN',JSON.stringify({name,...m,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),mime:'image/jpeg'}));for(let i=0;i<b64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),b64.slice(i,i+2048));console.log('RENDER_IMAGE_END');return m;};
 await page.locator('#load-body').click();await page.evaluate(()=>window.einarDemoQA62.loadBody());await idle();
 check(!(await page.evaluate(()=>window.einarDemoQA62.getPlayer().getState().staticOnly)),'Full motion enabled');check(!(await page.locator('#play').isDisabled()),'Play enabled');check(!(await page.locator('#timeline').isDisabled()),'Timeline enabled');
 await page.locator('#player-reset').click();await idle();const reference=await capture('einar62-tail-reference');check(reference.rawSha256==='e9814a3a03172648927680f22ac7787be0db9c4a02ebb065d4448dbb8db4b110','Fresh reference exact');const duration=await page.evaluate(()=>window.einarDemoQA62.getPlayer().getState().duration);
 // Bounded interactive regression only in segment A, before deterministic samples.
 const controlsRegression={executed:false};
 if((process.env.CAPTURE_SEGMENT||'a')==='a'){
  const neutralDigest=JSON.stringify(await digest());const channels=[];
  for(const [key,value]of [['jaw',.65],['smile',.7],['brow',.6],['blink',.8]]){
   await page.evaluate(({key,value})=>{const input=document.getElementById(key);input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},{key,value});await idle();
   const expressions=await page.evaluate(()=>window.einarDemoQA62.getCharacter().getState().expressions);
   check(Math.abs(expressions[key]-value)<1e-10,'Facial UI state '+key);check(JSON.stringify(await digest())!==neutralDigest,'Facial geometry changed '+key);
   channels.push({key,value,stateMatched:true,geometryChanged:true});
   await page.locator('#reset').click();await idle();check(JSON.stringify(await digest())===neutralDigest,'Facial exact neutral restore '+key);
  }
  await page.locator('#start-clip').click();await page.evaluate(()=>window.einarDemoQA62.getPlayer().whenReady());await idle();
  const ticksBefore=await page.evaluate(()=>window.einarDemoQA62.clock.stats.ticks);
  await page.locator('#play').click();await page.waitForFunction(ticks=>{const q=window.einarDemoQA62;return q.clock.stats.ticks>ticks&&q.getPlayer().getState().time>0;},ticksBefore,{timeout:30000});
  await page.evaluate(()=>document.getElementById('pause').click());await page.evaluate(()=>window.einarDemoQA62.getPlayer().whenReady());await idle();
  const paused=await page.evaluate(()=>({player:window.einarDemoQA62.getPlayer().getState(),clock:window.einarDemoQA62.clock.getState()}));check(!paused.player.playing&&!paused.clock.scheduled,'Pause stops host clock');
  await page.locator('#player-reset').click();await idle();check(JSON.stringify(await digest())===neutralDigest,'Playback exact neutral geometry reset');
  Object.assign(controlsRegression,{executed:true,channels,playAdvanced:true,pauseStopped:true,playbackResetExact:true});console.log('CONTROLS62_REGRESSION',JSON.stringify(controlsRegression));
 }
 await page.evaluate(()=>{const q=window.einarDemoQA62;q.getCharacter().root.rotation.y=Math.PI/3;document.getElementById('ground-reference').checked=true;document.getElementById('ground-reference').dispatchEvent(new Event('change',{bubbles:true}));q.scheduler.invalidate('sampled-framing');});await idle();
 const segment=process.env.CAPTURE_SEGMENT||'a',start=segment==='a'?0:19,end=segment==='a'?20:40;const frames=[];for(let i=start;i<end;i++){const phase=i/40,m=await capture('einar62-motion-'+String(i).padStart(2,'0'),phase);check(Math.abs(m.player.time-phase*duration)<1e-10,'Exact sample time');frames.push({phase,time:m.player.time,rawSha256:m.rawSha256,updateMs:m.player.lastUpdateMs});}
 const residualFrames=[];
 if(segment==='b'){
  const end=await capture('einar62-finite-end',1);check(end.player.time===duration&&!end.player.playing,'Finite paused end');
  // This exact source key falls between the evenly spaced output samples.
  const exact599=1.0000200000000001;
  await page.evaluate(()=>{const q=window.einarDemoQA62;q.getCharacter().root.rotation.y=0;q.frame('body');q.scheduler.invalidate('source599-front');});await idle();
  const whole=await capture('einar62-source599-front',null,exact599);check(whole.player.time===exact599,'Exact source599 whole-body time');residualFrames.push({view:'front',time:whole.player.time,rawSha256:whole.rawSha256,camera:whole.camera,target:whole.target});
  await page.evaluate(()=>{const q=window.einarDemoQA62;
   // Same front/organic-side direction as the native contact attribution, converted from source Z-up.
   const target=[-.08,-.15,.105],direction=[-.62,.18,2.095],length=Math.hypot(...direction),distance=.50/(2*Math.tan(q.camera.fov*Math.PI/360));
   q.controls.minDistance=.05;q.controls.target.set(...target);q.camera.position.set(...target.map((v,i)=>v+direction[i]/length*distance));q.camera.near=.001;q.camera.updateProjectionMatrix();q.controls.update();q.scheduler.invalidate('source599-hand-hip-detail');
  });await idle();
  const detail=await capture('einar62-source599-hand-hip-detail',null,exact599);check(detail.player.time===exact599,'Exact source599 detail time');residualFrames.push({view:'front-organic-hand-hip-detail',time:detail.player.time,rawSha256:detail.rawSha256,camera:detail.camera,target:detail.target});
 }
 await page.locator('#player-reset').click();await page.evaluate(()=>{const q=window.einarDemoQA62;q.getCharacter().root.rotation.y=0;document.getElementById('ground-reference').checked=false;document.getElementById('ground-reference').dispatchEvent(new Event('change',{bubbles:true}));q.frame('body');q.scheduler.invalidate('final-reference-reset');});await idle();
 const reset=await capture('einar62-segment-'+segment+'-reset');check(reset.rawSha256===reference.rawSha256,'Exact final reference reset');check(errors.length===0,JSON.stringify(errors));console.log('WALK62_SEQUENCE',JSON.stringify({pass:true,segment,frames,residualFrames,controlsRegression,referenceRawSha256:reference.rawSha256,resetRawSha256:reset.rawSha256,cameraYawDegrees:60,groundReference:true,previewWidth:384,previewHeight:480,outputFps:40/duration,duration,offlineRendered:true,limits:['Actual browser samples at deterministic times, not measured device FPS','Source interpolation and groom composition limits retained','Cloud software renderer, not iPhone hardware']}));await page.evaluate(()=>window.einarDemoQA62.destroy());
})().catch(e=>{console.error('WALK62_FAILED',e.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
