'use strict';
// Actual Chromium WebGL proof. No native scene, control rig, or input capture is loaded here.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),inputPath=path.join(__dirname,'proof-inputs68.json');
const inputs=JSON.parse(fs.readFileSync(inputPath)),files=new Map(inputs.localFiles.map(f=>[f.path,f]));
const allowedExternal=new Set(inputs.externalAssets.map(a=>a.url));
const digestBytes=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const results=path.join(__dirname,'proof-results68');fs.mkdirSync(results,{recursive:true});
const segment=process.env.CAPTURE_SEGMENT||'a';check(['a','b','c','d'].includes(segment),'Unknown capture segment');
check(inputs.mode==='full'||segment==='a','Pilot may run only the exact three-pose segment');
for(const f of inputs.localFiles){const target=path.resolve(root,f.path);check(target.startsWith(root+path.sep)&&!fs.lstatSync(target).isSymbolicLink(),'Unsafe local file');const bytes=fs.readFileSync(target);check(bytes.length===f.bytes&&digestBytes(bytes)===f.sha256,'Frozen file hash mismatch: '+f.path);}
const server=http.createServer((req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);check(files.has(name),'Not in explicit runtime allowlist');const f=files.get(name),file=path.resolve(root,name);check(file.startsWith(root+path.sep),'Path traversal');const b=fs.readFileSync(file);check(b.length===f.bytes&&digestBytes(b)===f.sha256,'Served file changed');res.writeHead(200,{'Content-Type':{'.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.md':'text/plain'}[path.extname(file)]||'application/octet-stream','Content-Length':b.length,'Cache-Control':'no-store'});res.end(b);}catch(error){res.writeHead(404).end('Not found');}});
let browser;
(async()=>{
 check(require('playwright-core/package.json').version==='1.57.0','Exact Playwright1.57.0 runtime required');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--use-gl=angle','--use-angle=swiftshader'],timeout:60000});
 const session=await browser.newBrowserCDPSession(),command=await session.send('Browser.getBrowserCommandLine');
 check(!command.arguments.some(a=>['--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--disable-web-security','--ignore-gpu-blocklist','--ignore-certificate-errors'].some(flag=>a===flag||a.startsWith(flag+'='))),'Unsafe Chromium security/bypass flag');
 console.log('BROWSER68',JSON.stringify({version:await browser.version(),arguments:command.arguments,sandbox:true,softwareRenderer:true}));
 const context=await browser.newContext({viewport:{width:738,height:480},deviceScaleFactor:1,serviceWorkers:'block'});
 const blocked=[],errors=[],failures=[],requests=[];
 await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).origin===origin||allowedExternal.has(url))return route.continue();blocked.push(url);return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(120000);
 page.on('request',request=>requests.push(request.url()));
 page.on('requestfailed',request=>failures.push({url:request.url(),error:request.failure()?.errorText}));
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('response',response=>{if(response.status()>=400)errors.push('HTTP '+response.status()+' '+response.url());});
 await page.goto(origin+'/package68/full-demo/index.html?qa68',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'main{grid-template-columns:384px 340px}#viewport{width:384px;height:480px;min-height:480px}'});
 await page.waitForFunction(()=>window.einarDemoQA68);
 const idle=()=>page.evaluate(()=>window.einarDemoQA68.scheduler.whenIdle());await idle();
 check(!requests.some(url=>allowedExternal.has(url)||url.includes('/packed68/')||url.includes('/packed55/')||url.includes('mappings55')),'Eager character or motion assets before explicit load');
 await page.locator('#load').click();await page.evaluate(()=>window.einarDemoQA68.load());await idle();
 check(!requests.some(url=>(allowedExternal.has(url)&&/einar-body|body-motion42/.test(url))||/\/packed68\/|\/packed55\/|mappings55/.test(url)),'Eager body or motion fetch during head-only load');
 const headOnly=await page.evaluate(()=>({state:window.einarDemoQA68.getCharacter().getState(),metadata:window.einarDemoQA68.getCharacter().metadata}));
 check(headOnly.state.bodyStatus==='not-loaded','Head-only deferred body state');
 await page.locator('#load-body').click();await page.evaluate(()=>window.einarDemoQA68.loadBody());await idle();
 const config=await page.evaluate(()=>window.einarDemoQA68.config),pilot=inputs.mode==='pilot';
 check(config.mode===inputs.mode&&config.frames.length===(pilot?3:80),'Capture config matches staged mode');
 check(Math.abs(config.duration-1.316693)<1e-12,'Original duration retained');
 check((await page.locator('#play').isDisabled())===pilot&&(await page.locator('#timeline').isDisabled())===pilot,'Pilot/full UI playback gating');
 if(pilot){
  const guard=await page.evaluate(()=>{const p=window.einarDemoQA68.getPlayer();let play=false,seek=false,update=false;try{p.play();}catch{play=true;}try{p.seek(.25);}catch{seek=true;}try{p.update(.01);}catch{update=true;}return {play,seek,update,state:p.getState()};});
  check(guard.play&&guard.seek&&guard.update&&!guard.state.playing,'Pilot blocks play/update/interpolated seeks');
 }
 const geometry=()=>page.evaluate(async()=>{
  const q=window.einarDemoQA68,root=q.getCharacter().root;root.updateMatrixWorld(true);
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const records=[];let meshes=0;
  root.traverse(o=>{if(o!==root)records.push({name:o.name,kind:'local-transform',data:Array.from(o.matrix.elements)});if(!o.isMesh)return;meshes++;
   const attrs={...o.geometry.attributes,...(o.geometry.index?{index:o.geometry.index}:{})};
   for(const [key,a]of Object.entries(o.geometry.morphAttributes||{}))a.forEach((v,i)=>attrs['morph.'+key+'.'+i]=v);
   for(const [key,attr]of Object.entries(attrs)){const a=attr.isInterleavedBufferAttribute?attr.data.array:attr.array;records.push({name:o.name,kind:key,type:a.constructor.name,bytes:a.byteLength,data:new Uint8Array(a.buffer,a.byteOffset,a.byteLength)});}
  });
  for(const record of records){const bytes=record.data instanceof Uint8Array?record.data:new Uint8Array(new Float64Array(record.data).buffer);record.sha256=await hash(bytes);delete record.data;}
  records.sort((a,b)=>(a.name+'\0'+a.kind).localeCompare(b.name+'\0'+b.kind));
  return {sha256:await hash(new TextEncoder().encode(JSON.stringify(records))),meshes,records};
 });
 const appearance=()=>page.evaluate(()=>{const c=window.einarDemoQA68.getCharacter(),materials=[];c.root.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material||[]))materials.push({mesh:o.name,name:m.name,type:m.type,uuid:m.uuid,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,opacity:m.opacity,textures:Object.entries(m).filter(([,v])=>v?.isTexture).map(([k,v])=>[k,v.uuid]).sort()});});return {materials,headPresent:!!c.root.getObjectByName('RENDER4-GEO-einar_head004'),groomPresent:!!c.root.getObjectByName('Einar24 full source beard scalp lashes'),bodyMeshCount:c.metadata.body?.meshes};});
 const appearanceBefore=await appearance();check(appearanceBefore.headPresent&&appearanceBefore.groomPresent&&appearanceBefore.bodyMeshCount===180,'Original detailed head/groom/body inventory');
 const configureView=async view=>{await page.evaluate(view=>{const q=window.einarDemoQA68;q.getCharacter().root.rotation.y=0;q.frame('body');q.controls.enableDamping=false;document.getElementById('ground-reference').checked=view!=='reference';document.getElementById('ground-reference').dispatchEvent(new Event('change',{bubbles:true}));if(view==='oblique'){const d=Math.hypot(.2,4.4);q.camera.position.set(d*Math.sin(Math.PI/3),.2,d*Math.cos(Math.PI/3));}else if(view==='hand-hip-contact'){const target=[-.08,-.15,.105],direction=[-.62,.18,2.095],length=Math.hypot(...direction),distance=.50/(2*Math.tan(q.camera.fov*Math.PI/360));q.controls.minDistance=.05;q.controls.target.set(...target);q.camera.position.set(...target.map((v,i)=>v+direction[i]/length*distance));}else if(view==='feet-contact'){q.frame('foot');}q.camera.updateProjectionMatrix();q.controls.update();q.scheduler.invalidate('proof-view-'+view);},view);await idle();};
 const captures=[];
 const capture=async(name,{frame=null,view='front'}={})=>{
  await configureView(view);
  const result=await page.evaluate(async({frame})=>{const q=window.einarDemoQA68;if(frame){q.clock.seek(frame.time);await q.getPlayer().whenReady();}await q.scheduler.whenRendered(q.scheduler.invalidate('proof-native-capture'));const gl=q.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,raw=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(width,height);for(let y=0;y<height;y++)pixels.data.set(raw.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(pixels,0,0);const rawSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join('');return {base64:canvas.toDataURL('image/jpeg',.95).split(',')[1],rawSha256,width,height,glError:gl.getError(),camera:q.camera.position.toArray(),target:q.controls.target.toArray(),memory:{...q.renderer.info.memory},draws:{...q.renderer.info.render},player:q.getPlayer().getState(),state:q.getCharacter().getState()};},{frame});
  check(result.glError===0,'WebGL error during '+name);check(result.draws.calls>0&&result.draws.triangles>0,'Actual geometry must render');if(frame)check(Math.abs(result.player.time-frame.time)<1e-12&&!result.player.playing,'Exact paused native sample '+frame.sourceFrame);
  const b64=result.base64;delete result.base64;const bytes=Buffer.from(b64,'base64');result.name=name;result.view=view;result.sourceFrame=frame?.sourceFrame??null;result.jpegSha256=digestBytes(bytes);result.sha256=result.jpegSha256;result.bytes=bytes.length;captures.push(result);fs.writeFileSync(path.join(results,name+'.jpg'),bytes);
  console.log('RENDER_IMAGE_BEGIN',JSON.stringify({...result,mime:'image/jpeg'}));for(let i=0;i<b64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),b64.slice(i,i+2048));console.log('RENDER_IMAGE_END');return result;
 };
 await page.locator('#player-reset').click();await idle();await configureView('reference');
 const neutral=await geometry();fs.writeFileSync(path.join(results,'geometry68-reference-'+segment+'.json'),JSON.stringify(neutral,null,2));console.log('GEOMETRY68_REFERENCE',JSON.stringify(neutral));
 const reference=await capture('einar68-'+inputs.mode+'-'+segment+'-reference',{view:'reference'});
 const regressions={faceChannels:[],playbackTested:false,exactPoseGuards:pilot};
 if(segment==='a'){
  const first=config.frames[0];await page.evaluate(async time=>{const q=window.einarDemoQA68;q.clock.seek(time);await q.getPlayer().whenReady();},first.time);await idle();const poseBefore=await geometry();
  for(const [key,value]of [['jaw',.65],['smile',.7],['brow',.6],['blink',.8]]){
   await page.evaluate(({key,value})=>{const input=document.getElementById(key);input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},{key,value});await idle();const changed=await geometry();
   const expressions=await page.evaluate(()=>window.einarDemoQA68.getCharacter().getState().expressions);check(Math.abs(expressions[key]-value)<1e-12,'Expression UI value '+key);check(changed.sha256!==poseBefore.sha256,'Expression changes real geometry '+key);
   const changedRecords=changed.records.filter((r,i)=>r.sha256!==poseBefore.records[i]?.sha256);
   await page.evaluate(()=>window.einarDemoQA68.getPlayer().setExpressions({jaw:0,smile:0,brow:0,blink:0}));await idle();const restoredPose=await geometry();check(restoredPose.sha256===poseBefore.sha256,'Exact posed facial restore '+key);
   await page.locator('#reset').click();await idle();const reset=await geometry();check(reset.sha256===neutral.sha256,'Exact original geometry reset '+key);
   regressions.faceChannels.push({key,value,sourceFrame:first.sourceFrame,beforeSha256:poseBefore.sha256,afterSha256:changed.sha256,restoredPoseSha256:restoredPose.sha256,neutralResetSha256:reset.sha256,changedRecords});
   await page.evaluate(async time=>{const q=window.einarDemoQA68;q.clock.seek(time);await q.getPlayer().whenReady();},first.time);await idle();
  }
  if(!pilot){
   await page.locator('#start-clip').click();await page.evaluate(()=>window.einarDemoQA68.getPlayer().whenReady());await idle();const ticks=await page.evaluate(()=>window.einarDemoQA68.clock.stats.ticks);
   await page.locator('#play').click();await page.waitForFunction(ticks=>{const q=window.einarDemoQA68;return q.clock.stats.ticks>ticks&&q.getPlayer().getState().time>0;},ticks,{timeout:45000});
   await page.locator('#pause').click();await page.evaluate(()=>window.einarDemoQA68.getPlayer().whenReady());await idle();const paused=await page.evaluate(()=>({player:window.einarDemoQA68.getPlayer().getState(),clock:window.einarDemoQA68.clock.getState()}));check(!paused.player.playing&&!paused.clock.scheduled,'Pointer-driven Pause stops clock');regressions.playbackTested=true;
  }
  await page.locator('#player-reset').click();await idle();check((await geometry()).sha256===neutral.sha256,'Post-control neutral reset');
 }
 console.log('CONTROLS68_REGRESSION',JSON.stringify(regressions));
 const start=pilot?0:'abcd'.indexOf(segment)*20,selected=pilot?config.frames:config.frames.slice(start,start+20);
 const nativeGeometry=[];
 for(const frame of selected){
  for(const view of ['front','oblique'])await capture('einar68-'+inputs.mode+'-'+frame.sourceFrame+'-'+view,{frame,view});
  const digest=await geometry();nativeGeometry.push({sourceFrame:frame.sourceFrame,time:frame.time,sha256:digest.sha256});
  if(pilot||[539,571,599,600,601,618].includes(frame.sourceFrame))for(const view of ['hand-hip-contact','feet-contact'])await capture('einar68-'+inputs.mode+'-'+frame.sourceFrame+'-'+view,{frame,view});
 }
 check(new Set(nativeGeometry.map(f=>f.sha256)).size===nativeGeometry.length,'Distinct native poses must change real geometry');
 await page.locator('#player-reset').click();await idle();await configureView('reference');const finalGeometry=await geometry();check(finalGeometry.sha256===neutral.sha256,'Final original geometry reset');
 const final=await capture('einar68-'+inputs.mode+'-'+segment+'-final-reset',{view:'reference'});check(final.rawSha256===reference.rawSha256,'Exact reference render restored');
 check(JSON.stringify(await appearance())===JSON.stringify(appearanceBefore),'Original materials/head/groom unchanged');
 check(errors.length===0&&failures.length===0&&blocked.length===0,JSON.stringify({errors,failures,blocked}));
 const report={pass:true,mode:inputs.mode,segment,objects:185,nativeSamplesInManifest:config.frames.length,nativeSamplesCaptured:selected.length,duration:config.duration,nominalSourceFps:60,sourceCadenceSeconds:.016667,geometryVerificationOnly:pilot,fullWalkClaim:false,fullWalkCoverageRequiresAllSegments:!pilot,realTimePerformanceClaim:false,appearanceUnchanged:true,noEagerCharacterAssets:true,noEagerBodyMotionAssets:true,regressions,nativeGeometry,referenceGeometrySha256:neutral.sha256,resetGeometrySha256:finalGeometry.sha256,referenceRawSha256:reference.rawSha256,resetRawSha256:final.rawSha256,captures,errors,failures,blocked,limits:['Actual deterministic WebGL samples, not device frame-rate evidence','Pilot mode contains no interpolated motion proof','Visual naturalness, contact and readiness require image review','Cloud software renderer, not physical iPhone hardware']};
 fs.writeFileSync(path.join(results,'proof68-'+inputs.mode+'-'+segment+'.json'),JSON.stringify(report,null,2));console.log('WALK68_SEQUENCE',JSON.stringify(report));await page.evaluate(()=>window.einarDemoQA68.destroy());
})().catch(error=>{console.error('WALK68_FAILED',error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
