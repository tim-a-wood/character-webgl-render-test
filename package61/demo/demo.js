import {runDeviceBenchmark59} from './device-benchmark59.js';
import {describeMeasurement61} from './measurement-result61.js';
import {attachEinarWalk60} from '../../package60/einar-walk60.js';
import {createPlayerClock55} from './player-loop55.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadEinar46,createReferenceScene46} from '../../package46/einar46.js?auth=46a';
import {installDemandRenderer41} from './demand-render41.js';
import {createRendererOrReport56} from './startup56.js';
function startDemo61(){
const $=id=>document.getElementById(id),keys=['jaw','smile','brow','blink'];
const renderer=createRendererOrReport56({createRenderer:()=>new THREE.WebGLRenderer({antialias:true}),document});if(!renderer)return;renderer.setPixelRatio(Math.min(devicePixelRatio,2));$('viewport').append(renderer.domElement);
const reference=createReferenceScene46(renderer),{scene,camera}=reference;
const ground=new THREE.GridHelper(3,12,0x52606d,0x34404b);ground.position.y=-.975219;ground.visible=false;scene.add(ground);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.autoRotateSpeed=.7;
const scheduler=installDemandRenderer41({renderer,scene,camera,controls,uiRoot:document,onError:fail});
let benchmarkAbort=null,benchmarkPromise=null;
let character=null,player=null,loadPromise=null,bodyPromise=null,bodyAbort=null,generation=0,view='head',closed=false;
const clock=createPlayerClock55({getPlayer:()=>player,onState:syncPlayer,onError:fail});
function syncPlayer(state=player?.getState()){if(!state){$('timeline').value=0;$('time-value').textContent='0.00 s';$('player-state').textContent='Load the body to enable playback.';return;}$('play').disabled=!!benchmarkAbort||!!state.staticOnly;$('timeline').disabled=!!benchmarkAbort||!!state.staticOnly;$('benchmark').disabled=!!benchmarkAbort||state.buffering||state.disposed||state.staticOnly;$('static-poses').hidden=!state.staticOnly;$('timeline').max=String(state.duration);$('timeline').value=String(state.time);$('time-value').textContent=state.time.toFixed(2)+' / '+state.duration.toFixed(2)+' s';$('player-state').textContent=(state.buffering?'Buffering':state.playing?'Playing':'Paused')+' · finite clip '+Math.round(state.time/state.duration*100)+'%';}
function fail(error){$('status').textContent='Unable to complete: '+(error?.message||String(error));}
function sync(){const s=character?.getState();for(const k of keys){const v=s?.expressions?.[k]||0;$(k).value=v;$(k+'-value').textContent=Math.round(v*100)+'%';}syncPlayer();}
function enable(){if(benchmarkAbort)return;const s=character?.getState(),ready=!!character&&!s?.disposed,body=ready&&s.bodyStatus==='ready';$('face').disabled=!ready||!!bodyPromise;for(const id of ['dispose','head-view'])$(id).disabled=!ready;$('reset').disabled=!ready||!!bodyPromise;$('body-view').disabled=!body;$('foot-view').disabled=!body;$('player').disabled=!player;$('load-body').disabled=!ready||!!bodyPromise||!!player;$('load').disabled=!!loadPromise||ready;const p=player?.getState();$('benchmark').disabled=!p||p.disposed||p.staticOnly||p.buffering;}
function frame(next=view){if(!character)return;if(next!=='head'&&character.getState().bodyStatus!=='ready')return;view=next;ground.visible=$('ground-reference').checked&&view!=='head';const h=character.getBounds().head;character.root.position.copy(next!=='head'?new THREE.Vector3(0,-.95,0):new THREE.Vector3().fromArray(h.center).negate());controls.target.set(0,0,0);if(next==='foot'){camera.position.set(0,-.55,1.6);controls.target.set(0,-.82,0);controls.minDistance=.05;controls.maxDistance=12;camera.near=.001;camera.far=100;}else if(next==='body'){camera.position.set(0,.2,4.4);controls.minDistance=.5;controls.maxDistance=12;camera.near=.001;camera.far=100;}else{camera.position.set(0,h.radius*.12,h.radius*3.8);controls.minDistance=h.radius*.35;controls.maxDistance=h.radius*12;camera.near=h.radius*.001;camera.far=h.radius*100;}camera.updateProjectionMatrix();controls.update();scheduler.invalidate('frame-'+next);}
async function load(){if(character)return character;if(loadPromise)return loadPromise;const g=++generation;$('status').textContent='Loading head…';loadPromise=(async()=>{const result=await loadEinar46({renderer,manifestUrl:new URL('../../package46/manifest.json',import.meta.url).href,onChange:()=>{if(!closed&&g===generation)scheduler.invalidate('character-change');},onProgress:p=>{if(g===generation)$('status').textContent=typeof p==='string'?p:'Loading reference assets…';}});if(g!==generation||closed){result.dispose();return null;}character=result;scene.add(result.root);view='head';frame();sync();const c=result.capabilities;$('capabilities').textContent='Three.js '+c.threeRevision+' · '+(c.astcSupported?'ASTC body textures supported':'Original PNG body selected before download')+' · custom groom runtime · four facial controls and one finite coordinated source-motion clip.';$('status').textContent='Head ready. Body has not been requested.';return result;})().catch(e=>{fail(e);throw e;}).finally(()=>{loadPromise=null;enable();});enable();return loadPromise;}
async function loadBody(){if(!character)throw Error('Load the head first');if(bodyPromise)return bodyPromise;if(player)return character;const owner=character,g=generation,abort=new AbortController();bodyAbort=abort;$('status').textContent='Loading body and walk animation…';const pending=(async()=>{await owner.loadBody();if(g!==generation||character!==owner)return null;const result=await attachEinarWalk60({character:owner,signal:abort.signal,manifestUrl:new URL('../../package55/packed55/manifest55.json',import.meta.url).href,manifestSha256:'c486cd667ef5775c572e603200f76fe683b0509c855300d23eedd9f31b630e24',overlayManifestUrl:new URL('../../package60/packed60/overlayManifest60.json',import.meta.url).href,overlayManifestSha256:'0e4163192a34a7bdc2880597c8366e2ccbcce209fb8f109c4c47eafa3677cbf3',onProgress:p=>{if(g===generation){if(typeof p==='string')$('status').textContent=p;else if(Number.isFinite(p?.loadedBytes)&&p.totalBytes>0)$('status').textContent='Verified motion download: '+(p.loadedBytes/1e6).toFixed(1)+' / '+(p.totalBytes/1e6).toFixed(1)+' MB ('+Math.min(100,Math.round(p.loadedBytes/p.totalBytes*100))+'%) · '+(p.stage||'loading');else $('status').textContent='Preparing initial pose · '+(p?.stage||'decoding motion')+'…';}},onChange:()=>{if(!closed&&g===generation){scheduler.invalidate('whole-character55');syncPlayer();}}});if(g!==generation||character!==owner){result.dispose();return null;}player=result;frame('body');sync();$('status').textContent=result.getState().staticOnly?'Three corrected posture poses ready. Choose an exact captured pose; playback is disabled. Reset reference restores the original model.':'Whole-character clip ready. Start clip selects its first pose; Reset reference restores the original model.';scheduler.invalidate('body-ready');return owner;})().catch(e=>{if(g===generation)fail(e);throw e;}).finally(()=>{if(bodyPromise===pending)bodyPromise=null;if(bodyAbort===abort)bodyAbort=null;enable();});bodyPromise=pending;enable();return pending;}
function disposeCharacter(){benchmarkAbort?.abort();generation++;bodyAbort?.abort();bodyAbort=null;bodyPromise=null;clock.pause();player?.dispose();player=null;if(character){scene.remove(character.root);character.dispose();character=null;}view='head';ground.visible=false;sync();enable();$('status').textContent='Character disposed. Load character to create a new instance.';scheduler.invalidate('character-disposed');}
function captureCamera(){return {position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),zoom:camera.zoom,target:controls.target.clone(),enabled:controls.enabled,autoRotate:controls.autoRotate};}
function restoreCamera(saved){camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.up.copy(saved.up);camera.zoom=saved.zoom;controls.target.copy(saved.target);controls.enabled=saved.enabled;controls.autoRotate=saved.autoRotate;camera.updateProjectionMatrix();camera.updateMatrixWorld();}
function setMeasurementMessage(text){$('benchmark-summary').textContent=text;}
async function measureDevice(){
 if(!player||benchmarkAbort||closed)return null;
 const owner=player,g=generation,abort=new AbortController(),savedCamera=captureCamera();
 benchmarkAbort=abort;
 const disabled=new Map([...document.querySelectorAll('button,input,select,fieldset')].map(e=>[e,e.disabled]));
 $('benchmark-result').textContent='No completed result yet.';
 setMeasurementMessage('Preparing the starting pose, then measuring one finite pass with an 8-second timer limit. Long synchronous work can delay the timer. Cancel or Dispose is available throughout.');
 const pending=(async()=>{
  try{
   const result=await runDeviceBenchmark59({player:owner,clock,renderer,scene,camera,controls,scheduler,getExpressions:()=>character.getState().expressions,signal:abort.signal,isCurrent:()=>g===generation&&player===owner,maxDurationMs:8000,onBusy:busy=>{if(busy){for(const e of disabled.keys())e.disabled=true;$('benchmark-cancel').disabled=false;$('dispose').disabled=false;}}});
   // An abort during the helper's restoration phase must not be called a valid run.
   if(abort.signal.aborted||g!==generation||player!==owner){const completion=g!==generation||player!==owner?'character disposed':result.interrupted?result.completion:'cancelled before result delivery';setMeasurementMessage('Measurement interrupted: '+completion+'. No valid completed measurement.');$('benchmark-result').textContent=JSON.stringify({...result,interrupted:true,completion},null,2);return null;}
   setMeasurementMessage(describeMeasurement61(result));$('benchmark-result').textContent=JSON.stringify(result,null,2);return result;
  }catch(e){setMeasurementMessage('Measurement invalid: '+(e?.message||String(e))+'. No device performance claim is made.');$('benchmark-result').textContent='No valid result.';return null;}
  finally{
   // Restore even on hidden-tab/context-loss cancellation, and without touching a disposed character.
   restoreCamera(savedCamera);
   if(benchmarkAbort===abort)benchmarkAbort=null;
   for(const [e,was]of disabled)e.disabled=was;
   $('benchmark-cancel').disabled=true;enable();sync();
   if(!closed)scheduler.invalidate('measurement-restored');
  }
 })();
 benchmarkPromise=pending;
 try{return await pending;}finally{if(benchmarkPromise===pending)benchmarkPromise=null;}
}
$('benchmark').addEventListener('click',()=>{void measureDevice();});
$('benchmark-cancel').addEventListener('click',()=>benchmarkAbort?.abort());
$('load').addEventListener('click',()=>load().catch(()=>{}));$('load-body').addEventListener('click',()=>loadBody().catch(()=>{}));$('dispose').addEventListener('click',disposeCharacter);
for(const k of keys)$(k).addEventListener('input',()=>{if(!character)return;(player||character).setExpressions(Object.fromEntries(keys.map(n=>[n,Number($(n).value)])));sync();scheduler.invalidate('expression-input');});
$('ground-reference').addEventListener('change',()=>{ground.visible=$('ground-reference').checked&&view!=='head';scheduler.invalidate('ground-reference');});
$('static-pose').addEventListener('change',()=>clock.seek(Number($('static-pose').value)));$('play').addEventListener('click',()=>{if(!player?.getState().staticOnly)clock.play();});$('pause').addEventListener('click',()=>clock.pause());$('timeline').addEventListener('input',()=>{if(!player?.getState().staticOnly)clock.seek(Number($('timeline').value));});$('start-clip').addEventListener('click',()=>clock.seek(0));$('player-reset').addEventListener('click',()=>clock.reset());
$('head-view').addEventListener('click',()=>frame('head'));$('body-view').addEventListener('click',()=>frame('body'));$('foot-view').addEventListener('click',()=>frame('foot'));$('reset').addEventListener('click',()=>{if(!character)return;clock.reset();if(player)player.setExpressions({jaw:0,smile:0,brow:0,blink:0});else character.reset();sync();frame();scheduler.invalidate('reset');});
function resize(){const r=$('viewport').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();scheduler.invalidate('resize-complete');}const observer=new ResizeObserver(resize);observer.observe($('viewport'));resize();
function destroy(){if(closed)return;closed=true;disposeCharacter();observer.disconnect();clock.dispose();scheduler.dispose();controls.dispose();scene.remove(ground);ground.geometry.dispose();ground.material.dispose();reference.dispose();renderer.dispose();renderer.domElement.remove();}
window.addEventListener('pagehide',destroy,{once:true});
if(new URLSearchParams(location.search).has('qa61'))window.einarDemoQA61={load,loadBody,disposeCharacter,destroy,measureDevice,cancelMeasurement:()=>benchmarkAbort?.abort(),getMeasurement:()=>({busy:!!benchmarkAbort,pending:benchmarkPromise}),getCharacter:()=>character,getPlayer:()=>player,clock,getView:()=>view,frame,scheduler,renderer,scene,camera,controls};


}
startDemo61();
