'use strict';
// This is capture/diagnostics around the official Khronos application, not a renderer.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const root=__dirname, inputs=JSON.parse(fs.readFileSync(path.join(root,'proof-inputs71.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const output=path.join(root,'standard-results71');fs.mkdirSync(output,{recursive:true});
const assetPath=path.resolve(root,inputs.asset.filename),asset=fs.readFileSync(assetPath);
check(assetPath.startsWith(root+path.sep)&&!fs.lstatSync(assetPath).isSymbolicLink(),'Unsafe asset path');
check(asset.length===inputs.asset.bytes&&sha(asset)===inputs.asset.sha256,'Frozen representative asset mismatch');
check(inputs.poses.length>=5&&inputs.poses.length<=10,'Small representative screenshot set only');
check(require('playwright-core/package.json').version==='1.57.0','Pinned Playwright required');
const dist=path.join(root,'official-viewer/dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.json':'application/json'};
const server=http.createServer((req,res)=>{try{
  const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const filename=requested==='/representative71.glb'?assetPath:path.resolve(dist,requested==='/'?'index.html':requested.slice(1));
  check(filename===assetPath||filename.startsWith(dist+path.sep),'Path outside official viewer');
  check(!fs.lstatSync(filename).isSymbolicLink(),'Symlink outside static proof');
  const bytes=fs.readFileSync(filename);
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(bytes);
}catch{res.writeHead(404).end('Not found');}});
const externalFixtures=new Map([
 ['https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json','fixtures/model-index.json'],
 ['https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/low_resolution_hdrs/Cannon_Exterior.hdr','fixtures/Cannon_Exterior.hdr'],
 ['https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Environments/low_resolution_hdrs/Cannon_Exterior.hdr.license','fixtures/Cannon_Exterior.hdr.license']
]);
let browser,page,browserDetails,loaded,playback,reset;
const snapshots=[],errors=[],warnings=[],failedRequests=[],blockedRequests=[],servedFixtures=[],glErrors=[],contextLosses=[];
const requestState=new Map(),consoleMessages=[],startupDiagnostics=[];
async function startupState(label){
  let timer;
  const state=await Promise.race([
    page.evaluate(()=>{
      const q=window.__standardViewer71,canvas=document.querySelector('#canvas'),gl=q?.view.context;
      return {url:location.href,documentReady:document.readyState,diagnosticBinding:!!q,
        gltfPresent:!!q?.state.gltf,meshCount:q?.state.gltf?.meshes?.length??null,skinCount:q?.state.gltf?.skins?.length??null,
        environmentPresent:!!q?.state.environment,isLoading:q?.getViewerState().isLoading??null,
        selectedModel:q?.getViewerState().selectedModel??null,animationNames:q?.state.gltf?.animations?.map(a=>a.name)??[],
        validationIssueCounts:q?.getViewerState().validationReport?.issues?{errors:q.getViewerState().validationReport.issues.numErrors,warnings:q.getViewerState().validationReport.issues.numWarnings}:null,
        lighting:q?{useIBL:q.state.renderingParameters.useIBL,directionalFallback:q.state.renderingParameters.useDirectionalLightsWithDisabledIBL,renderEnvironment:q.state.renderingParameters.renderEnvironmentMap}:null,
        canvas:canvas?{width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight}:null,
        gl:gl?{version:gl.getParameter(gl.VERSION),contextLost:gl.isContextLost(),error:gl.getError(),drawCalls:window.__drawCalls71||0}:null,
        bodyText:document.body?.innerText?.slice(0,2400)??''};
    }).catch(error=>({evaluationError:String(error)})),
    new Promise(resolve=>{timer=setTimeout(()=>resolve({evaluationTimedOut:true}),5000);})
  ]);clearTimeout(timer);
  const record={label,at:new Date().toISOString(),state,requests:[...requestState.values()].map(entry=>({...entry}))};
  if(state.gl?.error)glErrors.push({label,error:state.gl.error});
  if(state.gl?.contextLost)contextLosses.push({label,contextLost:true});
  startupDiagnostics.push(record);console.log('STANDARD71_STARTUP',JSON.stringify(record));return record;
}
async function exposeProbe(){
  await page.evaluate(()=>{
    const qa=window.__standardViewer71;
    const gl=qa.view.context;
    qa.canvas.addEventListener('webglcontextlost',()=>window.__contextLoss71=(window.__contextLoss71||0)+1);
    qa.probe=()=>{
      qa.view.renderFrame(qa.state,qa.canvas.width,qa.canvas.height);
      const image=qa.canvas.toDataURL('image/png');
      const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,pixels=new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const errors=[];for(let i=0;i<16;i++){const e=gl.getError();if(!e)break;errors.push(e);}
      let distinct=0;const background=[pixels[0],pixels[1],pixels[2]],histogram=new Uint32Array(32768);
      for(let i=0;i<pixels.length;i+=4){
        if(Math.abs(pixels[i]-background[0])+Math.abs(pixels[i+1]-background[1])+Math.abs(pixels[i+2]-background[2])>18)distinct++;
        histogram[((pixels[i]>>3)<<10)|((pixels[i+1]>>3)<<5)|(pixels[i+2]>>3)]++;
      }
      const dominant=[...histogram].sort((a,b)=>b-a).slice(0,2);
      const shadedPixelsBeyondTwoDominantColours=width*height-dominant[0]-dominant[1];
      const arrays=x=>x==null?[]:Array.from(x);
      const nodes=qa.state.gltf.nodes.map((n,index)=>({index,name:n.name,mesh:n.mesh,skin:n.skin,
        world:arrays(n.worldTransform),rotation:arrays(n.rotation),translation:arrays(n.translation),scale:arrays(n.scale),weights:arrays(n.weights)}));
      const meshes=qa.state.gltf.meshes.map((m,index)=>({index,name:m.name,weights:arrays(m.weights)}));
      const finite=nodes.every(n=>[...n.world,...n.rotation,...n.translation,...n.scale,...n.weights].every(Number.isFinite))&&meshes.every(m=>m.weights.every(Number.isFinite));
      const morphWeights=[...nodes,...meshes].filter(x=>x.weights.length).map(x=>({index:x.index,name:x.name,weights:x.weights}));
      const cameraNode=qa.state.cameraNodeIndex===undefined?null:qa.state.gltf.nodes[qa.state.cameraNodeIndex];
      const camera=cameraNode?qa.state.gltf.cameras[cameraNode.camera]:qa.state.userCamera;
      const cameraRecord={nodeName:cameraNode?.name??'User Camera',type:camera.type,
        viewMatrix:arrays(camera.getViewMatrix(qa.state.gltf)),projectionMatrix:arrays(camera.getProjectionMatrix(width/height)),
        worldMatrix:cameraNode?arrays(cameraNode.worldTransform):null,
        perspective:camera.type==='perspective'?{yfov:camera.perspective.yfov,aspectRatio:camera.perspective.aspectRatio,znear:camera.perspective.znear,zfar:camera.perspective.zfar}:null,
        orthographic:camera.type==='orthographic'?{xmag:camera.orthographic.xmag,ymag:camera.orthographic.ymag,znear:camera.orthographic.znear,zfar:camera.orthographic.zfar}:null};
      return {image,width,height,distinct,background,shadedPixelsBeyondTwoDominantColours,glErrors:errors,contextLosses:window.__contextLoss71||0,
        elapsedSeconds:qa.state.animationTimer.elapsedSec(),paused:qa.state.animationTimer.paused,
        animationIndices:qa.state.animationIndices,cameraNodeIndex:qa.state.cameraNodeIndex??null,
        finite,nodeCount:nodes.length,morphWeights,camera:cameraRecord,poseJSON:JSON.stringify({nodes,meshes}),
        statistics:qa.view.gatherStatistics(qa.state),drawCalls:window.__drawCalls71||0};
    };
  });
}
async function probe(){const result=await page.evaluate(()=>window.__standardViewer71.probe());result.poseSha256=sha(result.poseJSON);delete result.poseJSON;return result;}
function saveImage(label,dataURL){
  const bytes=Buffer.from(dataURL.split(',')[1],'base64'),name='standard71-'+label+'.png';fs.writeFileSync(path.join(output,name),bytes);
  const metadata={name,bytes:bytes.length,sha256:sha(bytes),mime:'image/png',method:'Official Khronos renderFrame and canvas.toDataURL'};
  console.log('RENDER_IMAGE_BEGIN',JSON.stringify(metadata));const b64=bytes.toString('base64');
  for(let i=0;i<b64.length;i+=2048)console.log('RENDER_IMAGE_CHUNK',String(i/2048).padStart(5,'0'),b64.slice(i,i+2048));console.log('RENDER_IMAGE_END');return metadata;
}
async function capture(label){
  const result=await probe();
  const requestedPose=inputs.poses.find(p=>p.label===label);
  check(result.finite,'Nonfinite standard-viewer pose '+label);
  check(result.glErrors.length===0,'WebGL errors at '+label+': '+result.glErrors.join(','));
  check(result.contextLosses===0,'WebGL context lost');
  check(result.distinct>500,'No visible model silhouette at '+label);
  check(result.shadedPixelsBeyondTwoDominantColours>500,'Only flat background/letterbox colours at '+label);
  check(result.statistics.faceCount>0,'No official renderer triangles');
  if(requestedPose.kind==='neutral')check(result.animationIndices.length===0&&result.elapsedSeconds===0&&result.morphWeights.every(m=>m.weights.every(w=>Math.abs(w)<1e-6)),'Neutral is not inactive zero-morph rest');
  if(requestedPose.expectMorphs)check(result.morphWeights.some(m=>m.weights.some(w=>Math.abs(w)>1e-6)),'Expected corrective/expression morph activity missing at '+label);
  result.image=saveImage(label,result.image);const snapshot={label,requestedPose,...result};snapshots.push(snapshot);
  console.log('STANDARD71_SNAPSHOT',JSON.stringify(snapshot));return snapshot;
}
async function setPose(pose){
  await page.evaluate(pose=>{
    const qa=window.__standardViewer71;
    const indices=pose.kind==='neutral'?[]:(pose.animationNames||[]).map(name=>{
      const index=qa.state.gltf.animations.findIndex(a=>a.name===name);if(index<0)throw Error('Unknown clip '+name);return index;});
    if(pose.kind!=='neutral'&&!indices.length)throw Error('No requested animation');
    qa.setViewerState({selectedAnimations:indices,animationState:false});
    qa.uiEvents.selectedAnimationsChanged.emit(indices);
    qa.state.animationTimer.fixedTime=null;
    qa.state.animationTimer.pause();qa.state.animationTimer.reset();
    if(pose.seconds>0)qa.state.animationTimer.setFixedTime(pose.seconds);
    if(pose.cameraName){const index=qa.state.gltf.nodes.findIndex(n=>n.name===pose.cameraName&&n.camera!==undefined);if(index<0)throw Error('Unknown glTF camera '+pose.cameraName);qa.uiEvents.cameraChanged.emit(index);
      if(pose.cameraYfov!==undefined){if(!(pose.cameraYfov>0&&pose.cameraYfov<Math.PI))throw Error('Invalid camera field of view');qa.state.gltf.cameras[qa.state.gltf.nodes[index].camera].perspective.yfov=pose.cameraYfov;}}
    else qa.uiEvents.cameraChanged.emit(-1);
    qa.view.renderFrame(qa.state,qa.canvas.width,qa.canvas.height);
  },pose);
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chromium',headless:true,chromiumSandbox:true,
    ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--use-gl=angle','--use-angle=swiftshader'],timeout:60000});
  const browserSession=await browser.newBrowserCDPSession(),command=await browserSession.send('Browser.getBrowserCommandLine');
  const forbidden=['--no-sandbox','--disable-setuid-sandbox','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--disable-web-security','--ignore-gpu-blocklist','--ignore-certificate-errors'];
  check(!command.arguments.some(a=>forbidden.some(flag=>a===flag||a.startsWith(flag+'='))),'Unsafe Chromium flags');
  browserDetails={version:await browser.version(),arguments:command.arguments,sandbox:true,renderer:'Sandboxed ANGLE SwiftShader on GitHub Linux; not phone hardware',viewport:{width:1200,height:900},dpr:1};
  const context=await browser.newContext({viewport:browserDetails.viewport,deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(new URL(url).origin===origin)return route.continue();
    if(externalFixtures.has(url)){const local=externalFixtures.get(url);servedFixtures.push({url,local,actualNetworkRequest:false});return route.fulfill({status:200,body:fs.readFileSync(path.join(root,local)),headers:{'Content-Type':local.endsWith('.json')?'application/json':'application/octet-stream','Access-Control-Allow-Origin':'*'}});}
    if(url==='https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap'){servedFixtures.push({url,local:'empty optional font stylesheet',actualNetworkRequest:false});return route.fulfill({status:200,contentType:'text/css',body:'/* Optional remote font disabled for local-only proof. */'});}
    blockedRequests.push(url);return route.abort();
  });
  await context.addInitScript(()=>{
    window.__drawCalls71=0;
    for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
      const original=WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method]=function(...args){window.__drawCalls71++;return original.apply(this,args);};
    }
  });
  page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
  page.on('console',m=>{if(consoleMessages.length<60)consoleMessages.push({type:m.type(),message:m.text().slice(0,1200)});if(m.type()==='error')errors.push({type:'console',message:m.text()});else if(m.type()==='warning')warnings.push(m.text());});
  page.on('request',r=>requestState.set(r,{url:r.url(),method:r.method(),startedAt:new Date().toISOString(),finished:false}));
  page.on('requestfinished',r=>{const entry=requestState.get(r);if(entry)Object.assign(entry,{finished:true,finishedAt:new Date().toISOString()});});
  page.on('requestfailed',r=>{const failure={url:r.url(),error:r.failure()?.errorText};failedRequests.push(failure);const entry=requestState.get(r);if(entry)Object.assign(entry,{finished:true,failed:true,error:failure.error,finishedAt:new Date().toISOString()});});
  page.on('response',r=>{const entry=requestState.get(r.request());if(entry)Object.assign(entry,{status:r.status(),contentLength:r.headers()['content-length']??null});if(r.status()>=400)errors.push({type:'http',message:r.status()+' '+r.url()});});
  await page.goto(origin+'/?standardProof71&model='+encodeURIComponent(origin+'/representative71.glb'),{waitUntil:'domcontentloaded'});
  await startupState('dom-content-loaded');
  const readiness=()=>{const q=window.__standardViewer71;return q?.state.gltf?.meshes?.length>0&&!q.getViewerState().isLoading&&q.state.renderingParameters.useIBL===false;};
  let ready=false;
  for(const [label,budget] of [['after-10s',10000],['after-30s',20000],['after-60s',30000],['after-120s',60000]]){
    try{await page.waitForFunction(readiness,null,{timeout:budget});ready=true;await startupState('ready');break;}
    catch(error){if(error.name!=='TimeoutError')throw error;await startupState(label);}
  }
  check(ready,'Official model was not ready within the unchanged 120-second startup budget; see startup predicate/request/GL diagnostics');
  check(glErrors.length===0&&contextLosses.length===0,'WebGL error or context loss during startup: '+JSON.stringify({glErrors,contextLosses}));
  await exposeProbe();
  // Use the official directional-light mode for diagnostic-material deformation checks.
  await page.evaluate(()=>window.__standardViewer71.uiEvents.renderEnvChanged.emit(false));
  loaded=await page.evaluate(()=>{const q=window.__standardViewer71;return {generator:q.state.gltf.asset.generator,animations:q.state.gltf.animations.map(a=>a.name),statistics:q.view.gatherStatistics(q.state),uiValidation:q.getViewerState().validationReport,webglVersion:q.view.context.getParameter(q.view.context.VERSION)};});
  check(loaded.generator.includes('glTF Blender I/O'),'Not the planned standard Blender exporter asset');
  check(loaded.animations.includes(inputs.playbackAnimation),'Requested exported clip missing');
  await page.locator('[data-testid="tab-animations"]').click();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await setPose({kind:'animation',animationNames:[inputs.playbackAnimation],seconds:0,cameraName:inputs.playbackCamera||null,cameraYfov:inputs.playbackCameraYfov});
  const beginning=await probe();delete beginning.image;
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  const start=Date.now();await page.waitForTimeout(1600);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const end=await probe();delete end.image;
  playback={wallMs:Date.now()-start,start:beginning,end,poseChanged:beginning.poseSha256!==end.poseSha256};
  check(end.elapsedSeconds>0.05&&end.drawCalls>beginning.drawCalls&&playback.poseChanged,'Official viewer playback did not advance rendered deformation');
  check(beginning.finite&&end.finite&&beginning.glErrors.length===0&&end.glErrors.length===0&&end.contextLosses===0,'WebGL/nonfinite error during official UI playback');
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  const resetPose=await probe();delete resetPose.image;
  reset={...resetPose,restoredClipStart:resetPose.poseSha256===beginning.poseSha256};
  check(reset.elapsedSeconds===0&&reset.restoredClipStart,'Official UI Reset did not restore clip time zero');
  check(reset.finite&&reset.glErrors.length===0&&reset.contextLosses===0,'WebGL/nonfinite error during official UI reset');
  const pageImage=await page.screenshot({path:path.join(output,'standard71-official-ui.png')});
  saveImage('official-ui','data:image/png;base64,'+pageImage.toString('base64'));
  await page.getByRole('button',{name:'Hide the controls',exact:true}).click();
  await page.waitForTimeout(250);
  for(const pose of inputs.poses){await setPose(pose);await capture(pose.label);}
  // Return to default rest with no active animations, then compare to initial neutral.
  const neutral=inputs.poses.find(p=>p.kind==='neutral');check(neutral,'Neutral test pose missing');
  await setPose(neutral);const finalNeutral=await probe();delete finalNeutral.image;
  const initialNeutral=snapshots.find(s=>s.label===neutral.label);
  check(finalNeutral.poseSha256===initialNeutral.poseSha256,'Rest transforms/morph weights changed after pose sequence');
  check(finalNeutral.finite&&finalNeutral.glErrors.length===0&&finalNeutral.contextLosses===0,'WebGL/nonfinite error at final neutral');
  if(inputs.requireAnimatedMorphs)check(snapshots.some(s=>s.morphWeights.some(m=>m.weights.some(w=>Math.abs(w)>1e-6))),'No active corrective/head morph weights observed in representative snapshots');
  check(errors.length===0,'Runtime errors: '+JSON.stringify(errors));
  check(failedRequests.length===0&&blockedRequests.length===0,'Unexpected browser network dependency');
  const report={format:'official-standard-viewer-proof71-v1',pass:true,completedAt:new Date().toISOString(),asset:inputs.asset,
    upstream:JSON.parse(fs.readFileSync(path.join(root,'upstream-build71.json'))),browser:browserDetails,loaded,playback,reset,restReset:true,
    lighting:'Official directional-light mode, no optional HDR preprocessing',startupDiagnostics,consoleMessages,snapshots,errors,warnings,glErrors,contextLosses,failedRequests,blockedRequests,servedFixtures,
    limits:['Small representative export, not whole-character acceptance.','Synthetic sandboxed desktop Chromium/SwiftShader, not an iPhone benchmark.','Diagnostic references and directional-light application configuration only; official loader, shaders, skinning, morphing and renderer algorithms unmodified.','Exact pose times use upstream AnimationTimer and GltfView public APIs; real UI Play/Pause/Reset independently checked.','Camera yfov overrides widen framing without changing exported geometry or camera transforms.','Upstream UI integrated validator suppresses one issue code; separate CLI Khronos validation is authoritative and suppresses none.','Artistic fidelity requires independent screenshot review against the original source.']};
  fs.writeFileSync(path.join(output,'standard-viewer71.json'),JSON.stringify(report,null,2));console.log('STANDARD71_RESULT',JSON.stringify(report));
})().catch(async error=>{
  if(page)await startupState('failure');
  const report={pass:false,error:error.stack,browser:browserDetails,loaded,playback,reset,startupDiagnostics,consoleMessages,snapshots,errors,warnings,glErrors,contextLosses,failedRequests,blockedRequests,servedFixtures};
  fs.writeFileSync(path.join(output,'standard-viewer71-failure.json'),JSON.stringify(report,null,2));console.error('STANDARD71_FAILED',JSON.stringify(report));process.exitCode=1;
}).finally(async()=>{await browser?.close();server.close();});
