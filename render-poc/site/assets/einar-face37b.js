import * as THREE from 'three';
import {createHybridGroom37b} from './hybrid-groom37b.js';
// Einar Rig © Blender Foundation / Blender Studio, CC BY4.0.
// Iteration37 exact sparse groom update. Mesh arithmetic unchanged from26b; requires exact18/24 data.
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export async function attachEinarFace37b({model,groom,oral,url,compressedSha256,sha256}) {
 const res=await fetch(url);if(!res.ok)throw Error('Face26 fetch '+res.status);const zip=await res.arrayBuffer();if(await hash(zip)!==compressedSha256)throw Error('Face26 compressed hash');const buffer=await new Response(new Blob([zip]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(await hash(buffer)!==sha256)throw Error('Face26 decoded hash');
 const dv=new DataView(buffer);if(dv.getUint32(0,true)!==0x36324645)throw Error('Face26 format');const hl=dv.getUint32(4,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,hl))),base=8+hl;
 if(oral.parent!==model)model.add(oral);model.updateMatrixWorld(true);const meshes=[];model.traverse(o=>{if(o.isMesh&&o!==groom)meshes.push(o)});const bindings=[],groomBindings=[];const metadata={sha256,compressedSha256,channels:['jaw','smile','brow','blink'],mappedMeshes:[],mappingMaxM:0,sourceApproximation:true,stabilizedSourceCurves:3,unvalidatedPhysicalDevice:true};
 const typed=(field,Type)=>{if(field.offset<0||field.bytes<0||base+field.offset+field.bytes>buffer.byteLength)throw Error('Face26 field bounds');return new Type(buffer,base+field.offset,field.bytes/Type.BYTES_PER_ELEMENT)};
 const pathName=o=>{let a=[];while(o&&o!==model){a.push(o.name);o=o.parent}return a.join('/')};
 for(const e of header.entries){
  const delta=typed(e.deltas,Int16Array);if(delta.length!==7*e.count*3)throw Error('Face26 delta length');
  if(e.kind==='groom'){groomBindings.push({e,delta,offsets:typed(e.curve_offsets,Uint32Array)});continue}
  const targets=meshes.filter(m=>e.kind==='brow'?/source[ _]brow[ _]ribbons/i.test(pathName(m)):pathName(m).includes(THREE.PropertyBinding.sanitizeNodeName(e.name)));if(!targets.length)throw Error('Face26 missing mesh '+e.name);
  let ref=null,grid=null;const cell=.00002;
  if(e.kind==='mesh'){ref=typed(e.reference,Float32Array);grid=new Map();for(let i=0;i<e.count;i++){const key=`${Math.floor(ref[3*i]/cell)},${Math.floor(ref[3*i+1]/cell)},${Math.floor(ref[3*i+2]/cell)}`;const a=grid.get(key);if(a)a.push(i);else grid.set(key,[i])}}
  for(const mesh of targets){
   const pos=mesh.geometry.attributes.position,norm=mesh.geometry.attributes.normal;if(pos.isInterleavedBufferAttribute)throw Error('Face26 unsupported interleaved base');const index=new Uint32Array(pos.count),p=new THREE.Vector3(),inverse=new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).invert(),normalInverse=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld).invert();let max=0;
   if(e.kind==='brow'){if(pos.count!==e.count)throw Error('Face26 brow point count '+pos.count);for(let i=0;i<index.length;i++)index[i]=i}
   else for(let i=0;i<pos.count;i++){
    p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);const q=[Math.floor(p.x/cell),Math.floor(p.y/cell),Math.floor(p.z/cell)];let best=-1,d2=Infinity;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const list=grid.get(`${q[0]+x},${q[1]+y},${q[2]+z}`);if(list)for(const j of list){const d=(ref[3*j]-p.x)**2+(ref[3*j+1]-p.y)**2+(ref[3*j+2]-p.z)**2;if(d<d2){d2=d;best=j}}}
    if(best<0||d2>1e-10)throw Error('Face26 mapping exceeds0.01mm '+e.name+' '+i+' '+Math.sqrt(d2));index[i]=best;max=Math.max(max,Math.sqrt(d2));
   }
   metadata.mappingMaxM=Math.max(metadata.mappingMaxM,max);metadata.mappedMeshes.push({name:mesh.name,source:e.name,vertices:pos.count,maxMappingM:max});bindings.push({mesh,e,delta,index,rest:pos.array.slice(),normalRest:norm?.array.slice(),normalDelta:e.normal_deltas?typed(e.normal_deltas,Int16Array):null,inverse,normalInverse});mesh.frustumCulled=false;
  }
 }
 const packed=groom.geometry.attributes.position.data.array,restGroom=packed.slice();let sourcePoint=0;for(const g of groomBindings){g.firstVertex=sourcePoint*2;sourcePoint+=g.e.count}if(sourcePoint*22!==packed.length)throw Error('Face26 groom size');
 const sparse=createHybridGroom37b(packed,restGroom,groomBindings);metadata.sparseGroom37=sparse.metadata;
 const state={jaw:0,smile:0,brow:0,blink:0};const vec=new THREE.Vector3(),nv=new THREE.Vector3();
 function setExpressions(values={}){
  for(const key of metadata.channels){if(values[key]!==undefined){if(!Number.isFinite(values[key]))throw Error('Face26 nonfinite control');state[key]=Math.max(0,Math.min(1,values[key]))}}
  const w=[state.jaw,state.smile,state.brow,state.blink,2*Math.min(state.jaw,1-state.jaw),2*Math.min(state.blink,1-state.blink),state.jaw*state.smile],zero=w.every(x=>x===0);const started=performance.now();
  for(const b of bindings){const {mesh,e,delta,index,rest,normalRest,normalDelta,inverse,normalInverse}=b,pa=mesh.geometry.attributes.position,na=mesh.geometry.attributes.normal;
   if(zero){pa.array.set(rest);if(na&&normalRest)na.array.set(normalRest)}else for(let i=0;i<index.length;i++){
    const j=index[i]*3;let x=0,y=0,z=0,nx=0,ny=0,nz=0;
    for(let k=0;k<7;k++){if(!w[k])continue;const a=k*e.count*3+j,f=w[k]*e.delta_scale;x+=delta[a]*f;y+=delta[a+1]*f;z+=delta[a+2]*f;if(normalDelta){const nf=w[k]*e.normal_scale;nx+=normalDelta[a]*nf;ny+=normalDelta[a+1]*nf;nz+=normalDelta[a+2]*nf}}
    vec.set(x,y,z).applyMatrix3(inverse);pa.array[3*i]=rest[3*i]+vec.x;pa.array[3*i+1]=rest[3*i+1]+vec.y;pa.array[3*i+2]=rest[3*i+2]+vec.z;
    if(na&&normalDelta){nv.set(nx,ny,nz).applyMatrix3(normalInverse);nv.set(normalRest[3*i]+nv.x,normalRest[3*i+1]+nv.y,normalRest[3*i+2]+nv.z).normalize();na.array[3*i]=nv.x;na.array[3*i+1]=nv.y;na.array[3*i+2]=nv.z}
   }
   pa.needsUpdate=true;if(na)na.needsUpdate=true;
  }
  sparse.update(w,zero);
  groom.geometry.attributes.position.data.needsUpdate=true;metadata.lastUpdateMs=performance.now()-started;metadata.state={...state};metadata.zeroRestored=zero;return {...metadata.state};
 }
 setExpressions({jaw:0,smile:0,brow:0,blink:0});return {setExpressions,metadata,state};
}

