// Static62 validation is independent of Three.js and has no I/O or mutable state.
export const STATIC_SOURCE_FRAMES62 = Object.freeze([539,579,618]);
export const RETAINED_OBJECT_NAMES60 = Object.freeze(['GEO-einar_head','GEO-einar_sweater','GEO-einar_beard','GEO-einar_beard.messy','GEO-einar_hair','GEO-einar_hair.messy']);
export const FORMAT62 = 'einar62-selected-object-static-overlay-v1';
const sharedFields=['kind','transform','positionCount','normalCount','positionUnit','normalUnit','basePosition','baseNormal','loopToNormalGroup','curveOffsets','loopCount','loopSha256','curveCount','offsetsSha256'];
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const require62=(value,label)=>{if(!value)throw Error('Walk62 '+label);};
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function validateStaticOverlay62(base,overlay,contract,manifestSha256,overlayManifestSha256){
 require62(contract&&Array.isArray(contract.objectNames)&&contract.objectNames.length>=6,'frozen object contract required');
 const names=contract.objectNames;
 require62(new Set(names).size===names.length&&RETAINED_OBJECT_NAMES60.every(n=>names.includes(n)),'frozen object allowlist');
 require62(manifestSha256===contract.baseManifestSha256&&overlayManifestSha256===contract.manifestSha256&&hash(manifestSha256)&&hash(overlayManifestSha256),'frozen manifest identity');
 require62(base.version===55&&base.status==='complete'&&Array.isArray(base.objects)&&base.objects.length===185&&new Set(base.objects.map(o=>o.name)).size===185,'whole-character base');
 require62(overlay.version===62&&overlay.format===FORMAT62&&overlay.status==='complete'&&overlay.staticOnly===true&&overlay.keyframeInterval===1,'complete static-only manifest');
 require62(overlay.baseManifestSha256===manifestSha256&&overlay.duration===base.duration&&overlay.sourceStartTime===base.sourceStartTime&&overlay.sourceFps===base.sourceFps,'base timeline identity');
 require62(equal(overlay.targetSourceFrames,STATIC_SOURCE_FRAMES62)&&equal(contract.sourceFrames,STATIC_SOURCE_FRAMES62),'three source frames');
 require62(equal(overlay.allowedObjectNames,names)&&equal(overlay.retained60Objects,RETAINED_OBJECT_NAMES60)&&Array.isArray(overlay.objects)&&equal(overlay.objects.map(o=>o.name),names),'selected object names/order');
 require62(overlay.byteOrder==='little-endian'&&overlay.matrixLayout==='row-major'&&overlay.positionUnit===0.00005&&overlay.normalUnit===0.001,'fixed wire format');
 require62(overlay.matrixBytes===names.length*64&&integer(overlay.decodedBytes,overlay.matrixBytes),'matrix header');
 const indices=new Set();let offset=overlay.matrixBytes;
 for(let i=0;i<overlay.objects.length;i++){
  const o=overlay.objects[i],index=o.baseObjectIndex;
  require62(integer(index)&&index<base.objects.length&&!indices.has(index),'unique base object indices');indices.add(index);
  const original=base.objects[index];
  require62(o.name===original.name&&o.baseMatrixOffset===original.matrixOffset,'base object identity');
  require62(sharedFields.every(k=>equal(o[k],original[k])),'shared auxiliary mismatch '+o.name);
  require62(integer(o.positionCount,1)&&integer(o.normalCount)&&o.matrixOffset===i*64&&o.positionOffset===offset,'position layout '+o.name);
  offset+=o.positionCount*6;
  require62(o.normalOffset===(o.normalCount?offset:null),'normal layout '+o.name);offset+=o.normalCount*6;
 }
 require62(offset===overlay.decodedBytes,'decoded layout length');
 require62(Array.isArray(overlay.frames)&&overlay.frames.length===3,'exactly three complete poses');
 let total=0;
 for(let i=0;i<3;i++){
  const f=overlay.frames[i],frame=STATIC_SOURCE_FRAMES62[i],expected=base.frames.find(b=>b.sourceFrame===frame);
  require62(expected&&f.index===i&&f.baseFrameIndex===expected.index&&f.sourceFrame===frame&&f.time===expected.time&&f.sourceTime===expected.sourceTime&&f.keyframe===true,'independent exact-time key');
  require62(hash(f.sha256)&&hash(f.decodedSha256)&&f.absoluteSha256===f.decodedSha256&&hash(f.sourceInventorySha256)&&integer(f.compressedBytes,1)&&typeof f.url==='string'&&f.url.length>0,'pose integrity fields');total+=f.compressedBytes;
 }
 require62(integer(overlay.compressedBytes)&&overlay.compressedBytes===total&&integer(base.compressedBytes)&&base.compressedBytes+total<=150000000&&overlay.activeSafetyCeilingBytes===150000000,'total compressed safety budget');
 return new Map(overlay.objects.map(o=>[o.name,o]));
}
export function exactStaticTime62(frames,time){
 require62(Number.isFinite(time)&&frames.some(f=>f.time===time),'static diagnostic requires an exact captured time');
 return time;
}
export function rejectStaticPlay62(){throw Error('Walk62 static pose diagnostic cannot play');}
