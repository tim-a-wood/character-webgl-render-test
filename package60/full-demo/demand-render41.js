// Demand-driven viewer scheduling. No scene, material, geometry or resolution changes.
export function installDemandRenderer41({renderer,scene,camera,controls,uiRoot=null,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,onError=console.error}){
 let pending=null,disposed=false,lost=false,updating=false,revision=0,renderedRevision=-1,tail=false;
 const waiters=[],idleWaiters=[],listeners=[];
 const stats={frames:0,controlUpdates:0,tailUpdates:0,invalidations:0,revision:0,renderedRevision:-1,contextLosses:0,contextRestores:0,lastError:null};
 const snapshot=()=>[...camera.position.toArray(),...camera.quaternion.toArray(),...controls.target.toArray(),camera.zoom];
 const equal=(a,b)=>a.every((x,i)=>x===b[i]);
 function schedule(){if(!disposed&&!lost&&pending===null)pending=requestFrame(frame);}
 function invalidate(reason='explicit'){if(disposed)throw Error('Demand41 disposed');revision++;stats.invalidations++;stats.revision=revision;stats.lastReason=reason;schedule();return revision;}
 function settleWaiters(){for(let i=waiters.length-1;i>=0;i--)if(waiters[i].revision<=renderedRevision){waiters.splice(i,1)[0].resolve({...stats});}if(pending===null&&!tail&&!controls.autoRotate&&!lost){while(idleWaiters.length)idleWaiters.shift().resolve({...stats});}}
 function frame(){pending=null;if(disposed||lost)return;const intended=revision;try{
  updating=true;stats.controlUpdates++;const changed=controls.update();tail=false;
  // OrbitControls' change epsilon can hide a remaining floating-point tail.
  // Drain only that sub-threshold tail, in bounded batches; preserve its exact math.
  if(!controls.autoRotate&&!changed){let stable=false;for(let i=0;i<64;i++){const before=snapshot();controls.update();stats.controlUpdates++;stats.tailUpdates++;if(equal(before,snapshot())){stable=true;break;}}tail=!stable;}else if(!controls.autoRotate)tail=true;
  updating=false;renderer.render(scene,camera);stats.frames++;if(lost)return;renderedRevision=intended;stats.renderedRevision=renderedRevision;
  if(controls.autoRotate||tail||revision>renderedRevision)schedule();settleWaiters();
 }catch(error){updating=false;stats.lastError=String(error?.stack||error);for(const w of [...waiters.splice(0),...idleWaiters.splice(0)])w.reject(error);onError(error);}}
 function listen(object,event,handler){object?.addEventListener?.(event,handler);listeners.push([object,event,handler]);}
 listen(controls,'change',()=>{if(!updating)invalidate('camera-change');});listen(controls,'start',()=>invalidate('orbit-start'));listen(controls,'end',()=>invalidate('orbit-end'));
 for(const event of ['input','change','click','keydown'])listen(uiRoot,event,()=>invalidate('ui-'+event));
 listen(renderer.domElement,'webglcontextlost',()=>{lost=true;stats.contextLosses++;if(pending!==null)cancelFrame(pending);pending=null;});
 listen(renderer.domElement,'webglcontextrestored',()=>{lost=false;stats.contextRestores++;invalidate('context-restored');});
 renderer.setAnimationLoop(null);invalidate('installation');
 return {stats,invalidate,whenRendered(target=revision){if(renderedRevision>=target)return Promise.resolve({...stats});return new Promise((resolve,reject)=>waiters.push({revision:target,resolve,reject}));},whenIdle(){if(pending===null&&!tail&&!controls.autoRotate&&!lost)return Promise.resolve({...stats});return new Promise((resolve,reject)=>idleWaiters.push({resolve,reject}));},getState(){return {pending:pending!==null,disposed,lost,revision,renderedRevision,tail,autoRotate:controls.autoRotate};},dispose(){disposed=true;if(pending!==null)cancelFrame(pending);pending=null;for(const [object,event,handler]of listeners)object?.removeEventListener?.(event,handler);const error=Error('Demand41 disposed');for(const w of [...waiters.splice(0),...idleWaiters.splice(0)])w.reject(error);}};
}
