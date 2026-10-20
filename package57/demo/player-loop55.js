// Host clock for finite async frame-pair playback. Buffered wall-time is discarded.
export function createPlayerClock55({getPlayer,onState=()=>{},onError=()=>{},requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,now=()=>performance.now()}){
 let frame=null,last=0,disposed=false,revision=0;const stats={ticks:0,elapsed:0,bufferWaits:0};
 function stop(){revision++;if(frame!==null)cancelFrame(frame);frame=null;last=0;}
 function notify(p){onState(p.getState());}
 function schedule(){if(disposed||frame!==null||!getPlayer()?.getState().playing)return;last=now();frame=requestFrame(tick);}
 function ready(p,rev){stats.bufferWaits++;Promise.resolve(p.whenReady()).then(()=>{if(disposed||rev!==revision||p!==getPlayer())return;notify(p);schedule();}).catch(e=>{if(disposed||rev!==revision||p!==getPlayer())return;p.pause();stop();onError(e);notify(p);});}
 function tick(time){frame=null;if(disposed)return;const p=getPlayer();if(!p?.getState().playing){last=0;return;}if(p.getState().buffering){ready(p,revision);return;}const dt=Math.max(0,(time-last)/1000);last=time;try{p.update(dt);stats.ticks++;stats.elapsed+=dt;notify(p);if(p.getState().buffering)ready(p,revision);else if(p.getState().playing)frame=requestFrame(tick);else last=0;}catch(e){p.pause();stop();onError(e);}}
 return {stats,play(){if(disposed)throw Error('Player clock disposed');const p=getPlayer();if(!p)throw Error('Load motion first');stop();p.play();notify(p);if(p.getState().buffering)ready(p,revision);else schedule();},pause(){getPlayer()?.pause();stop();if(getPlayer())notify(getPlayer());},seek(time){const p=getPlayer();if(!p)throw Error('Load motion first');p.pause();stop();p.seek(time);notify(p);if(p.getState().buffering)ready(p,revision);},reset(){stop();const p=getPlayer();p?.reset();if(p)notify(p);},dispose(){if(disposed)return;disposed=true;getPlayer()?.pause();stop();},getState:()=>({scheduled:frame!==null,disposed})};
}
