// Einar v1, Blender Foundation / Blender Studio, CC BY 4.0.
// Source-evaluated finger frames. This extension is a sampled clip, not a general skeletal rig.
const sha=async a=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',a instanceof ArrayBuffer?a:a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength)))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function checked(url,hash){const u=new URL(url,location.href);const r=await fetch(u,{credentials:u.origin===location.origin?'same-origin':'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('Animation47 HTTP '+r.status);const b=await r.arrayBuffer();if(await sha(b)!==hash)throw Error('Animation47 SHA');return b;}
export async function attachEinarAnimation47({character,dataUrl,dataSha256,manifestUrl,manifestSha256,onChange=()=>{}}){
 if(character.getState().bodyStatus!=='ready')throw Error('Animation47 requires loaded body');
 const m=JSON.parse(new TextDecoder().decode(await checked(manifestUrl,manifestSha256)));if(m.version!==47||m.frameCount!==54||m.meshes.length!==2||m.compressedSha256!==dataSha256)throw Error('Animation47 manifest');
 const zip=await checked(dataUrl,dataSha256),buffer=await new Response(new Blob([zip]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(buffer.byteLength!==m.decodedBytes||await sha(buffer)!==m.decodedSha256)throw Error('Animation47 decoded SHA');
 const found=new Map();character.root.traverse(o=>{if(o.isMesh)found.set(o.name,o);});const prepared=[];
 for(const s of m.meshes){const mesh=found.get('BODY27-'+s.name);if(!mesh)throw Error('Animation47 missing '+s.name);const g=mesh.geometry;if(g.attributes.tangent)throw Error('Animation47 unexpected tangent');
  for(const [key,attr]of Object.entries({POSITION:g.attributes.position,NORMAL:g.attributes.normal,INDEX:g.index})){if(!attr||attr.isInterleavedBufferAttribute)throw Error('Animation47 layout');let a=attr.array;if(key==='INDEX'){const T=s.baseline.INDEX.dtype==='uint16'?Uint16Array:Uint32Array;for(const n of a)if(!Number.isInteger(n)||n<0||n>=s.count)throw Error('Animation47 index range');a=new T(a);}if(await sha(a)!==s.baseline[key].sha256)throw Error('Animation47 baseline '+s.name+' '+key);}
  const channels={};for(const kind of ['position','normal']){const c=s.channels[kind];if(c.offset%2||c.length!==54*s.count*3*2||c.offset+c.length>buffer.byteLength||c.scale.length!==3||c.scale.some(x=>!Number.isFinite(x)||x<=0))throw Error('Animation47 channel bounds');const a=new Int16Array(buffer,c.offset,c.length/2);if(await sha(a)!==c.sha256)throw Error('Animation47 channel SHA');channels[kind]={...c,values:a};}
  prepared.push({mesh,g,s,channels,position:g.attributes.position.array.slice(),normal:g.attributes.normal.array.slice(),box:g.boundingBox?.clone()||null,sphere:g.boundingSphere?.clone()||null,frustumCulled:mesh.frustumCulled});
 }
 let disposed=false,time=0,playing=false,loop=true,sourceFrame=null,updates=0;
 const state=()=>({clip:'fingers',time,duration:m.duration,playing,loop,sourceFrame,disposed,updates});
 function guard(){if(disposed||character.getState().disposed)throw Error('Animation47 disposed');}
 function restore(){for(const x of prepared){x.g.attributes.position.array.set(x.position);x.g.attributes.normal.array.set(x.normal);x.g.attributes.position.needsUpdate=true;x.g.attributes.normal.needsUpdate=true;x.g.boundingBox=x.box?.clone()||null;x.g.boundingSphere=x.sphere?.clone()||null;x.mesh.frustumCulled=x.frustumCulled;}sourceFrame=null;}
 function evaluate(){guard();const tick=Math.min(106,Math.round(time*24));const frame=1+(tick<=53?tick:106-tick);if(frame===sourceFrame)return;character.setWrist(0);
  for(const x of prepared){const size=x.s.count*3,off=(frame-1)*size;for(const kind of ['position','normal']){const a=x.g.attributes[kind].array,b=x[kind],c=x.channels[kind];for(let i=0;i<size;i++)a[i]=b[i]+c.values[off+i]*c.scale[i%3];if(kind==='normal')for(let i=0;i<size;i+=3){const len=Math.hypot(a[i],a[i+1],a[i+2]);if(len){a[i]/=len;a[i+1]/=len;a[i+2]/=len;}}x.g.attributes[kind].needsUpdate=true;}x.g.computeBoundingBox();x.g.computeBoundingSphere();}
  sourceFrame=frame;updates++;onChange(state());
 }
 return {metadata:{version:47,source:m.source,compressedBytes:zip.byteLength,decodedBytes:buffer.byteLength,meshes:2,sourceFrames:54,sampledPlayback:true},getState:state,
  play(){guard();if(time>=m.duration)time=0;playing=true;evaluate();onChange(state());return state();},pause(){guard();playing=false;onChange(state());return state();},
  seek(seconds){guard();if(!Number.isFinite(seconds)||seconds<0||seconds>m.duration)throw Error('Animation47 seek range');time=seconds;evaluate();return state();},
  setLoop(value){guard();loop=!!value;onChange(state());return state();},
  update(dt){guard();if(!Number.isFinite(dt)||dt<0)throw Error('Animation47 elapsed time');if(!playing)return state();time+=dt;if(time>=m.duration){if(loop)time%=m.duration;else{time=m.duration;playing=false;}}evaluate();return state();},
  reset(){guard();playing=false;time=0;character.setWrist(0);restore();onChange(state());return state();},
  dispose(){if(disposed)return;playing=false;if(!character.getState().disposed){character.setWrist(0);restore();}disposed=true;onChange(state());}
 };
}
