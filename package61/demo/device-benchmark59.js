// Optional local measurement only. No telemetry, persistence or GPU synchronization.
const summary=values=>{if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return {count:a.length,medianMs:a[Math.floor((a.length-1)*.5)],p95Ms:a[Math.ceil((a.length-1)*.95)]};};
export async function runDeviceBenchmark59({player,clock,renderer,scene,camera,controls,scheduler,getExpressions,onBusy=()=>{},signal,isCurrent=()=>true,maxDurationMs=8000,now=()=>performance.now(),requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,document:doc=globalThis.document}){
 if(!player||player.getState().disposed||player.getState().staticOnly)throw Error('Load the finite motion before measuring');
 if(doc.hidden)throw Error('Keep this page visible while measuring');
 const initial=player.getState();if(initial.buffering)throw Error('Wait for the current pose to finish loading');
 const saved={active:initial.active,time:initial.time,playing:initial.playing,face:{...getExpressions()},enabled:controls.enabled,autoRotate:controls.autoRotate};
 const originalDescriptor=Object.getOwnPropertyDescriptor(renderer,'render'),originalRender=renderer.render,intervals=[],renderIntervals=[],renderMs=[],updateMs=[];let frame=null,timer=null,start=0,last=null,bufferStart=null,bufferMs=0,bufferCount=0,reason='complete',measuring=false,abortRun=null,renderWrapper=null,lastUpdates=0,renderStart=0,lastRenderStart=null,cancelled=false,rejectPreparation=null;
 const restoreEligible=()=>isCurrent()&&!player.getState().disposed;
 const stop=why=>{reason=why;cancelled=true;rejectPreparation?.(Error(why));abortRun?.();};
 const abort=()=>stop('cancelled'),visibility=()=>{if(doc.hidden)stop('hidden-tab interruption');},contextLost=()=>stop('WebGL context lost');
 const boundedReady=(interruptible=false,pending)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>finish(Error('Pose readiness timed out')),30000);const finish=e=>{clearTimeout(t);if(rejectPreparation===fail)rejectPreparation=null;e?reject(e):resolve();};const fail=e=>finish(e);if(interruptible)rejectPreparation=fail;Promise.resolve(pending??player.whenReady()).then(()=>finish(),finish);if(interruptible&&cancelled)finish(Error(reason));});

 let result,error;
 try{
  signal?.addEventListener('abort',abort,{once:true});doc.addEventListener('visibilitychange',visibility);renderer.domElement.addEventListener('webglcontextlost',contextLost);if(signal?.aborted)stop('cancelled');
  onBusy(true);clock.pause();controls.enabled=false;controls.autoRotate=false;
  scheduler.invalidate('benchmark-settle');await boundedReady(true,scheduler.whenIdle());player.seek(0);await boundedReady(true);if(signal?.aborted||cancelled||doc.hidden||renderer.getContext?.().isContextLost?.()||!restoreEligible())throw Error('Measurement cancelled before start');
  renderWrapper=function(...args){const t=now();if(measuring&&args[0]===scene&&args[1]===camera){if(lastRenderStart!==null)renderIntervals.push(t-lastRenderStart);lastRenderStart=t;}try{return originalRender.apply(this,args);}catch(e){error=e;stop('render submission failed');throw e;}finally{if(measuring&&args[0]===scene&&args[1]===camera)renderMs.push(now()-t);}};renderer.render=renderWrapper;

  start=now();renderStart=scheduler.stats.frames;lastUpdates=player.getState().updates;measuring=true;
  await new Promise(resolve=>{abortRun=resolve;clock.play();if(cancelled){resolve();return;}timer=setTimeout(()=>stop('time limit reached'),maxDurationMs);const tick=t=>{frame=null;if(!restoreEligible()){stop('character disposed');return;}if(doc.hidden){stop('hidden-tab interruption');return;}if(last!==null)intervals.push(t-last);last=t;const s=player.getState();if(s.error){error=Error(String(s.error));stop('playback failed');return;}if(s.updates!==lastUpdates){lastUpdates=s.updates;if(Number.isFinite(s.lastUpdateMs))updateMs.push(s.lastUpdateMs);}if(s.buffering&&bufferStart===null){bufferStart=now();bufferCount++;}else if(!s.buffering&&bufferStart!==null){bufferMs+=now()-bufferStart;bufferStart=null;}if(!s.playing&&!s.buffering){resolve();return;}frame=requestFrame(tick);};frame=requestFrame(tick);});
  const end=now(),state=player.getState();if(bufferStart!==null)bufferMs+=end-bufferStart;
  result={method:'One finite pass; RAF callback intervals and CPU JavaScript call durations. No GPU completion measurement.',completion:reason,interrupted:reason!=='complete',elapsedMs:end-start,animationAdvancedSeconds:state.time,sampleCount:intervals.length+1,tooFewSamples:intervals.length<10||renderMs.length<10,completedRenderCount:scheduler.stats.frames-renderStart,rafIntervals:summary(intervals),renderCallStartIntervals:summary(renderIntervals),renderSubmissionCpu:summary(renderMs),poseApplicationCpu:summary(updateMs),observedBufferingMsEstimate:bufferMs,observedBufferingCount:bufferCount,resolution:{width:renderer.domElement.width,height:renderer.domElement.height},limitations:'RAF intervals are observed callbacks, not proof of presented frames. Synchronous renderer.render wall time may include driver stalls but is not GPU completion. Buffering is RAF-sampled and may miss short waits. Pose application samples use the latest observed update, not necessarily every update. Results are not a device FPS score.'};
 }catch(e){error=e;}finally{
  measuring=false;abortRun=null;if(frame!==null)cancelFrame(frame);clearTimeout(timer);signal?.removeEventListener('abort',abort);doc.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('webglcontextlost',contextLost);
  if(renderer.render===renderWrapper){if(originalDescriptor)Object.defineProperty(renderer,'render',originalDescriptor);else delete renderer.render;}
  if(restoreEligible()){clock.pause();try{player.setExpressions(saved.face);if(saved.active){player.seek(saved.time);await boundedReady();}else player.reset();if(saved.playing)clock.play();}catch(e){error=error||e;}}
  controls.enabled=saved.enabled;controls.autoRotate=saved.autoRotate;onBusy(false);
 }
 if(error)throw error;return result;
}
