import {loadEinarPatch23} from './assets/einar-patch23.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
const draco=new DRACOLoader();draco.setDecoderPath('./assets/draco/');
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
const $=id=>document.getElementById(id);let active=0,versions=[],model,request=0,radius=1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202824');
const camera=new THREE.PerspectiveCamera(34,1,.01,1000);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true});}catch(e){$('status').textContent='WebGL is unavailable in this browser. The model cannot be displayed or captured here.'; $('capture-status').textContent='PNG capture requires a browser that can render this model.'; fetch('versions.json').then(r=>r.json()).then(vs=>{const wanted=new URLSearchParams(location.hash.slice(1)).get('iteration');const v=vs.find(x=>x.id===wanted)||vs[0];$('title').textContent=v.title;$('scope').textContent=v.scope;$('limits').textContent=v.limits;$('size').textContent=(v.bytes/1e6).toFixed(1)+' MB';$('rig').textContent=v.skins?'Orphan rig metadata; no working deformation or animation.':'No rig or animation';$('version').innerHTML='';const o=document.createElement('option');o.textContent=v.title;$('version').appendChild(o);});throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;$('viewport').appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.autoRotateSpeed=.7;
scene.add(new THREE.HemisphereLight(0xdde7f1,0x777866,2));
for(const [position,color,power] of [[[4,5,6],0xfff0db,2.5],[[-4,2,3],0xc5dcff,1.5],[[2,3,-4],0xe4f1e9,2]]){const l=new THREE.DirectionalLight(color,power);l.position.set(...position);scene.add(l);}
function resize(){const r=$('viewport').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe($('viewport'));
function reset(){camera.position.set(0,radius*.12,radius*3.8);controls.target.set(0,0,0);controls.minDistance=radius*.35;controls.maxDistance=radius*12;camera.near=radius*.001;camera.far=radius*100;camera.updateProjectionMatrix();controls.update();}
function dispose(obj){obj.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[])){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
async function select(index){$('capture').disabled=true;const token=++request;active=index;const v=versions[index];$('version').value=v.id;$('title').textContent=v.title;$('scope').textContent=v.scope;$('limits').textContent=v.limits;$('size').textContent=(v.bytes/1e6).toFixed(1)+' MB';$('rig').textContent=v.skins?'Orphan rig metadata; no working deformation or animation.':'No rig or animation';$('previous').disabled=index===versions.length-1;$('next').disabled=index===0;$('status').textContent='Loading actual export…';history.replaceState(null,'','#iteration='+v.id);if(model){scene.remove(model);dispose(model);model=null;}
try{let loaded=0;const chunks=[];for(const file of v.files){const r=await fetch(file);if(!r.ok)throw Error('Asset request failed ('+r.status+')');chunks.push(new Uint8Array(await r.arrayBuffer()));loaded+=chunks.at(-1).length;if(token!==request)return;$('status').textContent='Loading '+Math.round(loaded/v.bytes*100)+'% · '+(v.bytes/1e6).toFixed(1)+' MB';}const bytes=new Uint8Array(v.bytes);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}if(offset!==v.bytes)throw Error('Incomplete export');const gltf=await loader.parseAsync(bytes.buffer,'');if(token!==request){dispose(gltf.scene);return;}model=gltf.scene;const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const modelBounds=[box.min.toArray(),box.max.toArray()];if(v.expectedBounds&&modelBounds.some((row,i)=>row.some((x,j)=>Math.abs(x-v.expectedBounds[i][j])>1e-6)))throw Error('Model bounds differ from declared source bounds');let runtimePatch=null;if(v.runtimePatch){const patch=await loadEinarPatch23(v.runtimePatch);if(token!==request){dispose(patch.mesh);return;}model.add(patch.mesh);runtimePatch=patch.metadata;}model.position.sub(center);radius=Math.max(size.x,size.y,size.z)/2;scene.add(model);wire();reset();$('status').textContent='Actual GLB · '+v.title+' · static inspection';window.explorerState={iteration:v.id,loaded:true,runtimePatch,modelBounds,modelCenter:center.toArray(),meshes:0,animations:gltf.animations.length};model.traverse(o=>{if(o.isMesh)window.explorerState.meshes++;});$('capture').disabled=false;}catch(e){if(token===request){$('status').textContent='Could not load export: '+e.message;window.explorerState={iteration:v.id,loaded:false,error:e.message};}}}
function wire(){model?.traverse(o=>{for(const m of [].concat(o.material||[]))m.wireframe=$('wire').checked;});}
$('wire').onchange=wire;$('rotate').onchange=()=>controls.autoRotate=$('rotate').checked;$('reset').onclick=reset;$('previous').onclick=()=>select(active+1);$('next').onclick=()=>select(active-1);$('version').onchange=e=>select(versions.findIndex(v=>v.id===e.target.value));
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('copy-status').textContent='Iteration link copied.';}catch{$('copy-status').textContent='Copy the URL from your browser address bar.';}};
$('viewport').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key))return;e.preventDefault();const off=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(off);if(e.key==='ArrowLeft')s.theta-=.12;if(e.key==='ArrowRight')s.theta+=.12;if(e.key==='ArrowUp')s.phi-=.12;if(e.key==='ArrowDown')s.phi+=.12;if(e.key==='+'||e.key==='=')s.radius*=.9;if(e.key==='-')s.radius*=1.1;s.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();});
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});resize();
try{const r=await fetch('versions.json');if(!r.ok)throw Error('Version manifest unavailable');versions=await r.json();$('version').innerHTML='';for(const v of versions){const option=document.createElement('option');option.value=v.id;option.textContent=v.title;$('version').appendChild(option);}$('version').disabled=false;const wanted=new URLSearchParams(location.hash.slice(1)).get('iteration');select(Math.max(0,versions.findIndex(v=>v.id===wanted)));}catch(e){$('status').textContent=e.message;}

$('capture').onclick=()=>{
 if(!model)return;
 const v=versions[active]; renderer.render(scene,camera);
 const source=renderer.domElement,out=document.createElement('canvas');
 out.width=source.width;const scale=Math.max(1,source.width/1000);out.height=source.height+Math.round(180*scale);
 const ctx=out.getContext('2d');ctx.fillStyle='#131715';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(source,0,0);
 let y=source.height+30*scale;ctx.fillStyle='#e8e9e5';ctx.font=`${18*scale}px sans-serif`;ctx.fillText('ACTUAL BROWSER EXPORT · '+v.title,20*scale,y);y+=26*scale;ctx.font=`${12*scale}px sans-serif`;
 function wrap(text){let line='';for(const word of text.split(' ')){const test=line+word+' ';if(ctx.measureText(test).width>out.width-40*scale&&line){ctx.fillText(line,20*scale,y);y+=18*scale;line=word+' ';}else line=test;}ctx.fillText(line,20*scale,y);y+=22*scale;}
 wrap(v.scope);wrap('Experimental / unapproved. Einar Rig © Blender Foundation / Blender Studio · CC BY 4.0.');
 out.toBlob(blob=>{if(!blob){$('capture-status').textContent='Capture failed. Use your device screenshot instead.';return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='character-browser-iteration-'+v.id+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);$('capture-status').textContent='PNG prepared for saving. Attach it in chat for review.';},'image/png');
};

// Query-gated generic visual-test control; rendering materials and lights are unchanged.
if(new URLSearchParams(location.search).get('testViews')==='1'){
 let testPivot;
 window.benchmarkGenericPatch=()=>{const patch=model.getObjectByName('Einar23_source_under-chin_patch')||model.getObjectByName('Einar23 source under-chin patch');if(!patch)throw Error('Patch absent');const gl=renderer.getContext(),samples=[];for(const visible of [false,true,false,true]){patch.visible=visible;renderer.render(scene,camera);gl.finish();const t=performance.now();renderer.render(scene,camera);gl.finish();samples.push({visible,gpuSynchronizedWallMs:performance.now()-t,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,programs:renderer.info.programs.length});}patch.visible=true;return samples;};
 window.setGenericTestYaw=degrees=>{
  if(!model || !Number.isFinite(degrees) || Math.abs(degrees)>180)throw Error('Invalid test pose');
  if(!testPivot){testPivot=new THREE.Group();scene.remove(model);testPivot.add(model);scene.add(testPivot);}
  controls.autoRotate=false;reset();testPivot.rotation.set(0,THREE.MathUtils.degToRad(degrees),0);
  scene.updateMatrixWorld(true);const drawStart=performance.now();renderer.render(scene,camera);const renderSubmitMs=performance.now()-drawStart;
  const materials=[];model.traverse(o=>{if(o.isMesh)for(const m of (Array.isArray(o.material)?o.material:[o.material]))materials.push({mesh:o.name,name:m.name,transparent:m.transparent,depthWrite:m.depthWrite,alphaTest:m.alphaTest,alphaHash:m.alphaHash,shaderCompiled:m.userData.shaderCompiled||false});});
  return {materials,modelYawDegrees:degrees,renderSubmitMs,rendererTriangleDraws:renderer.info.render.triangles,rendererDrawCalls:renderer.info.render.calls,shaderPrograms:renderer.info.programs.length,cameraPosition:camera.position.toArray(),cameraTarget:controls.target.toArray(),cameraDistance:camera.position.distanceTo(controls.target),verticalFov:camera.fov,canvasWidth:renderer.domElement.width,canvasHeight:renderer.domElement.height};
 };
}
