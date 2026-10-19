// Einar © Blender Foundation / Blender Studio, CC BY4.0.
// Motion derived from Ian Mason's 100STYLE Neutral_FW, CC BY4.0.
// Finite evaluated-pose diagnostic. Fixed 30Hz samples; interpolation limits remain.
import * as THREE from 'three';
import {createFrameCache55} from '../package55/frame-cache55.js';
import {createCompressedStore55} from '../package55/compressed-store55.js';
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b instanceof ArrayBuffer?b:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)))].map(x=>x.toString(16).padStart(2,'0')).join('');
function checkAbort(signal){if(signal?.aborted)throw signal.reason??new DOMException('Walk55 attachment aborted','AbortError');}
async function checked(url,expected,signal){checkAbort(signal);const u=new URL(url,location.href),r=await fetch(u,{credentials:u.origin===location.origin?'same-origin':'omit',referrerPolicy:'no-referrer',signal});checkAbort(signal);if(!r.ok)throw Error('Walk55 HTTP '+r.status);const b=await r.arrayBuffer();checkAbort(signal);if(expected&&await sha(b)!==expected)throw Error('Walk55 SHA256');checkAbort(signal);return b;}
async function compressedBytes(spec,base,signal){
 if(!spec.parts)return checked(new URL(spec.url,base),spec.sha256,signal);
 if(!Array.isArray(spec.parts)||!spec.parts.length||!Number.isSafeInteger(spec.compressedBytes)||spec.compressedBytes<0)throw Error('Walk55 multipart descriptor');
 const zip=new Uint8Array(spec.compressedBytes);let offset=0;
 for(const part of spec.parts){if(!Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>zip.length-offset||!part.sha256)throw Error('Walk55 multipart bounds');const bytes=await checked(new URL(part.url,base),part.sha256,signal);if(bytes.byteLength!==part.bytes)throw Error('Walk55 multipart size');zip.set(new Uint8Array(bytes),offset);offset+=bytes.byteLength;}
 if(offset!==zip.length||!spec.sha256||await sha(zip)!==spec.sha256)throw Error('Walk55 multipart integrity');checkAbort(signal);return zip.buffer;
}
async function unzip(spec,base,signal){const zip=await compressedBytes(spec,base,signal);if(spec.compressedBytes!==undefined&&(!Number.isSafeInteger(spec.compressedBytes)||spec.compressedBytes<0||zip.byteLength!==spec.compressedBytes))throw Error('Walk55 compressed size');checkAbort(signal);const b=await new Response(new Blob([zip]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();checkAbort(signal);if(b.byteLength!==spec.decodedBytes||await sha(b)!==spec.decodedSha256)throw Error('Walk55 decoded integrity');checkAbort(signal);return b;}
const B=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1),BI=B.clone().invert();
function view(buffer,s){const T={float32:Float32Array,uint32:Uint32Array,int16:Int16Array}[s.dtype];const n=s.count*(s.components||1);if(!T||s.offset%T.BYTES_PER_ELEMENT||s.offset<0||s.offset+n*T.BYTES_PER_ELEMENT>buffer.byteLength)throw Error('Walk55 binary descriptor');return new T(buffer,s.offset,n);}
function rowMatrix(a,offset){return new THREE.Matrix4().fromArray(a,offset).transpose();}
// Apply row-major affine and its normal inverse-transpose without allocating per vertex.
function point(m,x,y,z,out){out[0]=m[0]*x+m[1]*y+m[2]*z+m[3];out[1]=m[4]*x+m[5]*y+m[6]*z+m[7];out[2]=m[8]*x+m[9]*y+m[10]*z+m[11];}
// Iteration56: direct finite-length evaluation, with original hypot for exceptional scales.
// No resampling, transform changes, extra arrays, or geometry/frame caches.
// The conservative squared-length bounds avoid overflow/underflow-sensitive fast cases.
function length3(x,y,z){const squared=x*x+y*y+z*z;return squared>1e-200&&squared<1e200?Math.sqrt(squared):Math.hypot(x,y,z);}
function vector(m,x,y,z,out){out[0]=m[0]*x+m[3]*y+m[6]*z;out[1]=m[1]*x+m[4]*y+m[7]*z;out[2]=m[2]*x+m[5]*y+m[8]*z;const d=length3(out[0],out[1],out[2])||1;out[0]/=d;out[1]/=d;out[2]/=d;}
export async function attachEinarWalk56({character,manifestUrl,manifestSha256,onChange=()=>{},onProgress=()=>{},signal}={}){
 if(character.getState().bodyStatus!=='ready')throw Error('Walk55 requires loaded body');
 checkAbort(signal);
 const savedExpressions={...character.getState().expressions};let cache=null,compressedStore=null,restoreOnFailure=null,abortDispose=null;
 const handleAbort=()=>{if(abortDispose){abortDispose();return;}cache?.dispose();compressedStore?.dispose();};
 signal?.addEventListener('abort',handleAbort,{once:true});
 try{
 character.setExpressions({jaw:0,smile:0,brow:0,blink:0});
 const base=new URL(manifestUrl,location.href),m=JSON.parse(new TextDecoder().decode(await checked(base,manifestSha256,signal)));
 if(m.version!==55||!Array.isArray(m.objects)||m.objects.length!==185||!Array.isArray(m.frames)||!Number.isFinite(m.duration))throw Error('Walk55 manifest');
 const ceiling=m.activeSafetyCeilingBytes,auxiliaryBytes=m.auxiliary?.compressedBytes,mappingBytes=m.mappingCompressedBytes;
 if(!Number.isSafeInteger(ceiling)||ceiling<=0||!Number.isSafeInteger(m.compressedBytes)||m.compressedBytes<0||m.compressedBytes>ceiling||!Number.isSafeInteger(auxiliaryBytes)||auxiliaryBytes<0||!Number.isSafeInteger(mappingBytes)||mappingBytes<0||auxiliaryBytes>ceiling-mappingBytes)throw Error('Walk55 compressed safety budget');
 const frameBudget=ceiling-auxiliaryBytes-mappingBytes;
 const auxiliary=await unzip(m.auxiliary,base,signal),mappingURL=new URL(m.mappings.url,base),mappingJSON=await checked(mappingURL,m.mappings.sha256,signal),maps=JSON.parse(new TextDecoder().decode(mappingJSON)),mappingData=await unzip({...maps.data,compressedBytes:mappingBytes-mappingJSON.byteLength},mappingURL,signal);
 if(maps.meshes.length!==181)throw Error('Walk55 complete mesh inventory');
 const frameManifest=m.frames.map(f=>({...f,url:new URL(f.url,base).href}));
 compressedStore=await createCompressedStore55({frames:frameManifest,maxBytes:frameBudget,signal,onProgress:event=>onProgress({...event,phase:'preload'})});
 checkAbort(signal);
 cache=createFrameCache55({frames:frameManifest,matrixBytes:m.matrixBytes,decodedBytes:m.decodedBytes,onProgress:event=>onProgress({...event,phase:'decode'}),maxCachedFrames:3,copyFrames:false,fetchImpl:compressedStore.fetchImpl});
 const found=new Map();character.root.updateMatrixWorld(true);character.root.traverse(o=>{if(o.isMesh)found.set(o.name,o);});
 const head=character.root.children[0];if(!head?.getObjectByName('RENDER4-GEO-einar_head004'))throw Error('Walk55 head hierarchy');
 const headRest=head.matrix.clone(),headAuto=head.matrixAutoUpdate,rootInverse=character.root.matrixWorld.clone().invert();
 const objects=new Map(m.objects.map(s=>[s.name,{s,baseP:view(auxiliary,s.basePosition),baseN:s.baseNormal?view(auxiliary,s.baseNormal):null,loopGroup:s.loopToNormalGroup?view(auxiliary,s.loopToNormalGroup):null,curveOffsets:s.curveOffsets?view(auxiliary,s.curveOffsets):null}]));
 const bindings=[];
 for(const entry of maps.meshes){checkAbort(signal);const mesh=found.get(entry.runtimeName),o=objects.get(entry.name);if(!mesh||!o)throw Error('Walk55 missing '+entry.name);const g=mesh.geometry,pa=g.attributes.position,na=g.attributes.normal;if(!pa||!na||pa.isInterleavedBufferAttribute)throw Error('Walk55 layout '+entry.name);
  for(const [k,attr]of Object.entries({POSITION:pa,NORMAL:na,INDEX:g.index})){let a=attr?.array;if(!a)throw Error('Walk55 missing attribute');if(k==='INDEX'){const T=entry.baselineAttributes[k].dtype==='uint16'?Uint16Array:Uint32Array;for(const v of a)if(!Number.isInteger(v)||v<0||v>=pa.count)throw Error('Walk55 index range');a=new T(a);}if(await sha(a)!==entry.baselineAttributes[k].sha256)throw Error('Walk55 baseline '+entry.name+' '+k);checkAbort(signal);}
  const pmap=view(mappingData,entry.positionMap),cmap=view(mappingData,entry.normalCornerMap);if(pmap.length!==pa.count||cmap.length!==pa.count)throw Error('Walk55 map count');for(let i=0;i<pmap.length;i++)if(pmap[i]>=o.s.positionCount||cmap[i]>=o.loopGroup.length)throw Error('Walk55 map bounds');
  const relative=rootInverse.clone().multiply(mesh.matrixWorld),localFromSource=relative.clone().invert().multiply(B);bindings.push({entry,o,mesh,g,pmap,cmap,restP:pa.array.slice(),restN:na.array.slice(),faceP:entry.name==='GEO-einar_head'?pa.array.slice():null,faceN:entry.name==='GEO-einar_head'?na.array.slice():null,localFromSource,localNormal:new THREE.Matrix3().getNormalMatrix(localFromSource),head:entry.name==='GEO-einar_head',tangent:g.attributes.tangent?.array.slice(),frustum:mesh.frustumCulled});
 }
 const baseVector=new THREE.Vector3();for(const x of bindings)if(x.head){x.sourceRestP=new Float32Array(x.restP.length);x.sourceRestN=new Float32Array(x.restN.length);for(let i=0;i<x.pmap.length;i++){const k=i*3,j=x.pmap[i]*3,n=x.o.loopGroup[x.cmap[i]]*3;baseVector.fromArray(x.o.baseP,j).applyMatrix4(x.localFromSource).toArray(x.sourceRestP,k);baseVector.fromArray(x.o.baseN,n).applyMatrix3(x.localNormal).normalize().toArray(x.sourceRestN,k);}}
 const groom=found.get('Einar24 full source beard scalp lashes');if(!groom)throw Error('Walk55 groom');const packed=groom.geometry.attributes.position.data.array;if(packed.length%22)throw Error('Walk55 groom stride');const faceGroom=new Float32Array(packed.length/22*6);
 function snapshotGroom(){for(let at=0,k=0;at<packed.length;at+=22,k+=6)for(let j=0;j<6;j++){if(!Object.is(packed[at+j],packed[at+11+j]))throw Error('Walk55 paired groom fields');faceGroom[k+j]=packed[at+j];}}
 function restoreGroom(){for(let at=0,k=0;at<packed.length;at+=22,k+=6)for(let j=0;j<6;j++)packed[at+j]=packed[at+11+j]=faceGroom[k+j];}
 snapshotGroom();
 const groomLocal=rootInverse.clone().multiply(groom.matrixWorld).invert().multiply(B),groomRanges=[];
 for(const r of maps.groomRanges){const o=objects.get(r.name);if(!o)continue;if(r.count!==o.s.positionCount||(r.firstPoint+r.count)*22>packed.length)throw Error('Walk55 groom range');const sourceRest=new Float32Array(r.count*3);for(let i=0;i<r.count;i++)baseVector.fromArray(o.baseP,i*3).applyMatrix4(groomLocal).toArray(sourceRest,i*3);groomRanges.push({r,o,sourceRest});}if(groomRanges.length!==4)throw Error('Walk55 four groom groups');
 let disposed=false,playing=false,active=false,buffering=false,time=0,requestedTime=0,request=0,pair=null,pending=Promise.resolve(),error=null,updates=0,lastUpdateMs=0;
 const state=()=>({clip:'whole-character55',time,requestedTime,duration:m.duration,playing,active,buffering,disposed,error,updates,lastUpdateMs,cache:cache.getStats(),compressedStore:compressedStore.getStats(),loop:false});
 const guard=()=>{if(disposed||character.getState().disposed)throw Error('Walk55 disposed');};
 const notify=()=>{try{const result=onChange(state());if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});}catch{/* UI observers do not own animation lifecycle. */}};
 const pA=[0,0,0],pB=[0,0,0],nA=[0,0,0],nB=[0,0,0],v=new THREE.Vector3(),nv=new THREE.Vector3();
 const headObject=objects.get('GEO-einar_head');
 function frameObject(o,frame){const s=o.s,mat=new Float32Array(frame.buffer,s.matrixOffset,16),pm=new Int16Array(frame.buffer,s.positionOffset,s.positionCount*3),nm=s.normalCount?new Int16Array(frame.buffer,s.normalOffset,s.normalCount*3):null;const mm=rowMatrix(mat,0);return {mat,pm,nm,normal:new THREE.Matrix3().getNormalMatrix(mm).elements};}
 function sourcePoint(o,a,b,i,w){const k=i*3,u=o.s.positionUnit;point(a.mat,o.baseP[k]+a.pm[k]*u[0],o.baseP[k+1]+a.pm[k+1]*u[1],o.baseP[k+2]+a.pm[k+2]*u[2],pA);point(b.mat,o.baseP[k]+b.pm[k]*u[0],o.baseP[k+1]+b.pm[k+1]*u[1],o.baseP[k+2]+b.pm[k+2]*u[2],pB);v.set(pA[0]*(1-w)+pB[0]*w,pA[1]*(1-w)+pB[1]*w,pA[2]*(1-w)+pB[2]*w);}
 function sourceNormal(o,a,b,i,w){const k=i*3,u=o.s.normalUnit;vector(a.normal,o.baseN[k]+a.nm[k]*u[0],o.baseN[k+1]+a.nm[k+1]*u[1],o.baseN[k+2]+a.nm[k+2]*u[2],nA);vector(b.normal,o.baseN[k]+b.nm[k]*u[0],o.baseN[k+1]+b.nm[k+1]*u[1],o.baseN[k+2]+b.nm[k+2]*u[2],nB);nv.set(nA[0]*(1-w)+nB[0]*w,nA[1]*(1-w)+nB[1]*w,nA[2]*(1-w)+nB[2]*w).normalize();}
 function apply(current){guard();const started=performance.now(),{a,b,mix:w}=current;const ha=rowMatrix(new Float32Array(a.buffer,headObject.s.matrixOffset,16),0),hb=rowMatrix(new Float32Array(b.buffer,headObject.s.matrixOffset,16),0),ta=new THREE.Vector3(),tb=new THREE.Vector3(),qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),sa=new THREE.Vector3(),sb=new THREE.Vector3();ha.decompose(ta,qa,sa);hb.decompose(tb,qb,sb);const h=new THREE.Matrix4().compose(ta.lerp(tb,w),qa.slerp(qb,w),sa.lerp(sb,w)),hi=h.clone().invert(),hin=new THREE.Matrix3().getNormalMatrix(hi);
  head.matrix.copy(B).multiply(h).multiply(BI).multiply(headRest);head.matrixAutoUpdate=false;head.matrixWorldNeedsUpdate=true;
  for(const x of bindings){const aa=frameObject(x.o,a),bb=frameObject(x.o,b),p=x.g.attributes.position.array,n=x.g.attributes.normal.array;for(let i=0;i<x.pmap.length;i++){const k=i*3;sourcePoint(x.o,aa,bb,x.pmap[i],w);if(x.head)v.applyMatrix4(hi);v.applyMatrix4(x.localFromSource);p[k]=v.x+(x.head?x.faceP[k]-x.sourceRestP[k]:0);p[k+1]=v.y+(x.head?x.faceP[k+1]-x.sourceRestP[k+1]:0);p[k+2]=v.z+(x.head?x.faceP[k+2]-x.sourceRestP[k+2]:0);sourceNormal(x.o,aa,bb,x.o.loopGroup[x.cmap[i]],w);if(x.head)nv.applyMatrix3(hin);nv.applyMatrix3(x.localNormal);if(x.head){nv.x+=x.faceN[k]-x.sourceRestN[k];nv.y+=x.faceN[k+1]-x.sourceRestN[k+1];nv.z+=x.faceN[k+2]-x.sourceRestN[k+2];}nv.normalize();n[k]=x.entry.preserveRuntimeNormals?x.restN[k]:nv.x;n[k+1]=x.entry.preserveRuntimeNormals?x.restN[k+1]:nv.y;n[k+2]=x.entry.preserveRuntimeNormals?x.restN[k+2]:nv.z;}
   x.g.attributes.position.needsUpdate=true;x.g.attributes.normal.needsUpdate=true;x.mesh.frustumCulled=false;if(x.tangent)x.g.computeTangents();
  }
  for(const {r,o,sourceRest}of groomRanges){const aa=frameObject(o,a),bb=frameObject(o,b);for(let i=0;i<r.count;i++){sourcePoint(o,aa,bb,i,w);v.applyMatrix4(hi).applyMatrix4(groomLocal);const at=(r.firstPoint+i)*22,f=(r.firstPoint+i)*6;for(const d of [0,11]){packed[at+d]=v.x+faceGroom[f]-sourceRest[i*3];packed[at+d+1]=v.y+faceGroom[f+1]-sourceRest[i*3+1];packed[at+d+2]=v.z+faceGroom[f+2]-sourceRest[i*3+2];}}
   const offsets=o.curveOffsets;for(let c=0;c<offsets.length-1;c++)for(let i=offsets[c];i<offsets[c+1];i++){const lo=(r.firstPoint+Math.max(offsets[c],i-1))*22,hi=(r.firstPoint+Math.min(offsets[c+1]-1,i+1))*22,at=(r.firstPoint+i)*22;let x=packed[hi]-packed[lo],y=packed[hi+1]-packed[lo+1],z=packed[hi+2]-packed[lo+2],len=length3(x,y,z)||1;for(const d of [0,11]){packed[at+d+3]=x/len;packed[at+d+4]=y/len;packed[at+d+5]=z/len;}}
  }
  groom.geometry.attributes.position.data.needsUpdate=true;active=true;updates++;lastUpdateMs=performance.now()-started;
 }
 function restore(){for(const x of bindings){x.g.attributes.position.array.set(x.head?x.faceP:x.restP);x.g.attributes.normal.array.set(x.head?x.faceN:x.restN);x.g.attributes.position.needsUpdate=true;x.g.attributes.normal.needsUpdate=true;x.mesh.frustumCulled=x.frustum;if(x.tangent){x.g.attributes.tangent.array.set(x.tangent);x.g.attributes.tangent.needsUpdate=true;}}restoreGroom();groom.geometry.attributes.position.data.needsUpdate=true;head.matrix.copy(headRest);head.matrixAutoUpdate=headAuto;head.matrixWorldNeedsUpdate=true;active=false;}
 restoreOnFailure=restore;
 let desired=null,running=false;
 function startPump(){
  if(running||disposed||desired===null)return;
  running=true;
  // Defer execution until pending is assigned, including progress-callback reentry.
  pending=Promise.resolve().then(async()=>{
   let failed=false,failure;
   try{
    while(desired!==null&&!disposed){
     const target=desired,id=request;desired=null;
     try{
      const next=await cache.getPair(target);
      if(disposed)return;
      if(id!==request)continue;
      pair=next;apply(pair);time=target;
     }catch(e){
      if(disposed)return;
      // An obsolete failure must not erase a newer seek or restore reset's error.
      if(id!==request)continue;
      buffering=false;playing=false;error=e?.message??String(e);desired=null;
      failed=true;failure=e;break;
     }
    }
   }finally{
    running=false;
    if(!disposed){
     buffering=desired!==null;
     // Release ownership first: observers may synchronously seek/play again.
     notify();
     if(desired!==null&&!running)startPump();
    }
   }
   if(failed)throw failure;
  });
  pending.catch(()=>{});
 }
 function schedule(t){requestedTime=t;desired=t;++request;buffering=true;error=null;startPump();notify();return state();}
 async function whenReady(){for(;;){const task=pending;try{await task;}catch(e){if(task===pending)throw e;}if(task===pending)return state();}}
 function setExpressions(values){guard();restore();character.setExpressions(values);for(const x of bindings)if(x.head){x.faceP.set(x.g.attributes.position.array);x.faceN.set(x.g.attributes.normal.array);}snapshotGroom();if(pair)apply(pair);notify();return character.getState().expressions;}
 const api={metadata:{version:55,source:m.source,limitations:m.limitations,finite:true,fullCharacter:true},getState:state,whenReady,setExpressions,
 play(){guard();playing=true;if(!active||time>=m.duration)schedule(0);notify();return state();},pause(){guard();playing=false;notify();return state();},seek(t){guard();if(!Number.isFinite(t)||t<0||t>m.duration)throw Error('Walk55 seek');return schedule(t);},update(dt){guard();if(!Number.isFinite(dt)||dt<0)throw Error('Walk55 elapsed');if(!playing||buffering)return state();const t=Math.min(m.duration,time+dt);if(t===m.duration)playing=false;return schedule(t);},reset(){guard();++request;desired=null;playing=false;buffering=false;error=null;time=requestedTime=0;pair=null;restore();notify();return state();},dispose(){if(disposed)return;++request;desired=null;playing=false;buffering=false;disposed=true;pair=null;signal?.removeEventListener('abort',handleAbort);abortDispose=null;try{if(!character.getState().disposed)restore();}finally{cache.dispose();compressedStore.dispose();notify();}}};
 abortDispose=()=>api.dispose();checkAbort(signal);
 setExpressions(savedExpressions);checkAbort(signal);schedule(0);await whenReady();checkAbort(signal);return api;
 }catch(cause){
  signal?.removeEventListener('abort',handleAbort);abortDispose=null;
  const rollbackErrors=[];
  try{cache?.dispose();}catch(e){rollbackErrors.push(e);}
  try{compressedStore?.dispose();}catch(e){rollbackErrors.push(e);}
  if(!character.getState().disposed){
   try{restoreOnFailure?.();}catch(e){rollbackErrors.push(e);}
   try{character.setExpressions(savedExpressions);}catch(e){rollbackErrors.push(e);}
  }
  if(rollbackErrors.length)throw new AggregateError([cause,...rollbackErrors],'Walk55 attachment failed and rollback was incomplete',{cause});
  throw cause;
 }
}

// Compatibility alias: source format, lifecycle API, and package55 data remain unchanged.
export {attachEinarWalk56 as attachEinarWalk55};
