import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {loadEinarGroom36} from './runtime/einar-groom36.js';
import {attachEinarFace37b} from './runtime/einar-face37b.js';
import {attachEinarMoustache38} from './runtime/einar-moustache38.js';
import {attachBodyMotion42} from './runtime/body-motion42c.js';
import {loadBody45} from './runtime/body-loader46.js';
import {enableCanonicalOpaqueOrder} from './runtime/canonical-opaque-order37b.js';
const HEAD_MIN=[-.13972650468349457,1.45891173183918,-.13773080246869823],HEAD_MAX=[.13972605764865875,1.880686596688355,.17094007777084727];
const headCenter=HEAD_MIN.map((x,i)=>(x+HEAD_MAX[i])/2),headRadius=Math.max(...HEAD_MIN.map((x,i)=>HEAD_MAX[i]-x))/2;
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const copy=x=>JSON.parse(JSON.stringify(x));
function release(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});root.removeFromParent();for(const x of textures){x.dispose();x.source?.data?.close?.();}for(const x of materials)x.dispose();for(const x of geometries)x.dispose();root.clear();return {geometries:geometries.size,materials:materials.size,textures:textures.size};}
export function createReferenceScene46(renderer){
 if(THREE.REVISION!=='160')throw Error('Einar46 requires tested Three.js r160');
 const old={color:renderer.outputColorSpace,tone:renderer.toneMapping,exposure:renderer.toneMappingExposure};
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;enableCanonicalOpaqueOrder(renderer);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#202824');const camera=new THREE.PerspectiveCamera(34,1,headRadius*.001,headRadius*100);camera.position.set(0,headRadius*.12,headRadius*3.8);
 scene.add(new THREE.HemisphereLight(0xdde7f1,0x777866,2));for(const [p,c,power]of [[[4,5,6],0xfff0db,2.5],[[-4,2,3],0xc5dcff,1.5],[[2,3,-4],0xe4f1e9,2]]){const l=new THREE.DirectionalLight(c,power);l.position.set(...p);scene.add(l);}
 let disposed=false;return {scene,camera,headCenter:[...headCenter],headRadius,dispose(){if(disposed)return;disposed=true;scene.clear();renderer.outputColorSpace=old.color;renderer.toneMapping=old.tone;renderer.toneMappingExposure=old.exposure;renderer.setOpaqueSort(null);}};
}
// Private same-origin manifests need the existing site session; external assets remain credential-free.
export function manifestFetchOptions46(url,pageUrl=globalThis.location?.href){
 const page=new URL(pageUrl),target=new URL(url,page);
 return {credentials:target.origin===page.origin?'same-origin':'omit',referrerPolicy:'no-referrer'};
}
export async function loadEinar46({renderer,manifestUrl=new URL('./manifest.json',import.meta.url),onChange=()=>{},onProgress=()=>{}}={}){
 if(!renderer||THREE.REVISION!=='160')throw Error('Einar46 requires a Three.js r160 renderer');
 if(!globalThis.crypto?.subtle||typeof DecompressionStream==='undefined')throw Error('Secure-context SHA256 and gzip DecompressionStream are required');
 const manifestResponse=await fetch(manifestUrl,manifestFetchOptions46(manifestUrl));if(!manifestResponse.ok)throw Error('Einar46 manifest HTTP '+manifestResponse.status);const manifest=await manifestResponse.json();const spec=manifest.version45;
 if(!spec||spec.sha256!=='e6a03bc8b8f573142e04ac886fe5732b545890cc7559910018aa7e90865d36ee')throw Error('Unsupported Einar46 baseline');
 const root=new THREE.Group();root.name='Einar46 character';const draco=new DRACOLoader().setDecoderPath(new URL('./runtime/draco/',import.meta.url).href).setWorkerLimit(2);const loader=new GLTFLoader().setDRACOLoader(draco);
 let disposed=false,face=null,body=null,motion=null,bodyPromise=null;const state={expressions:{jaw:0,smile:0,brow:0,blink:0},wrist:0,bodyStatus:'not-loaded',disposed:false};
 const metadata={version:46,baseline:45,source:'Einar, Blender Foundation / Blender Studio, CC BY4.0',headSha256:spec.sha256,body:null,cleanup:null,limits:['Custom groom/control runtime required','One sampled wrist gesture; not a full skeletal rig','Physical-device performance unverified']};
 const capabilities={astcSupported:renderer.extensions.has('WEBGL_compressed_texture_astc'),bodyMode:renderer.extensions.has('WEBGL_compressed_texture_astc')?'astc':'png-fallback',threeRevision:THREE.REVISION,requiresCustomGroom:true,fullSkeletalRig:false};
 const check=()=>{if(disposed)throw Error('Einar46 instance disposed');};
 async function fetchParts(files,expectedBytes,expectedHash,label){const parts=[];let total=0;for(const url of files){const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error(label+' HTTP '+r.status);const b=new Uint8Array(await r.arrayBuffer());parts.push(b);total+=b.length;onProgress({phase:label,bytes:total,totalBytes:expectedBytes||null});}const bytes=new Uint8Array(total);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}if(expectedBytes&&total!==expectedBytes)throw Error(label+' byte count');if(expectedHash&&await hash(bytes)!==expectedHash)throw Error(label+' SHA256');return bytes;}
 async function headBytes(){if(!manifest.head)return fetchParts(spec.files,spec.bytes,spec.sha256,'head');let bytes=await fetchParts(manifest.head.base.files,manifest.head.base.bytes,manifest.head.base.sha256,'head-base');for(const s of manifest.head.stages){if(await hash(bytes)!==s.baseSha256)throw Error('Head recipe base SHA256');const h=Uint8Array.from(atob(s.headerBase64),c=>c.charCodeAt(0)),tail=await fetchParts(s.suffixFiles,null,null,'head-suffix'),out=new Uint8Array(h.length+bytes.length-s.baseOffset+tail.length);out.set(h);out.set(bytes.subarray(s.baseOffset),h.length);out.set(tail,h.length+bytes.length-s.baseOffset);if(s.bytes&&out.length!==s.bytes)throw Error('Head recipe size');if(await hash(out)!==s.sha256)throw Error('Head recipe SHA256');bytes=out;}if(bytes.length!==spec.bytes||await hash(bytes)!==spec.sha256)throw Error('Final head integrity');return bytes;}
 async function loadOriginal(bodySpec){const bytes=await fetchParts(bodySpec.files,bodySpec.bytes,bodySpec.sha256,'body-png');const gltf=await loader.parseAsync(bytes.buffer,'');const targets=[],box=new THREE.Box3(),point=new THREE.Vector3();let meshes=0,triangles=0;gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position;for(let i=0;i<pos.count;i++)box.expandByPoint(point.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld));meshes++;triangles+=(o.geometry.index?.count||pos.count)/3;const index=o.morphTargetDictionary?.SourceGesture27;if(index!==undefined)targets.push({mesh:o,index});});if(meshes!==180||triangles!==1685454||targets.length!==14||[box.min.toArray(),box.max.toArray()].some((row,i)=>row.some((v,j)=>Math.abs(v-bodySpec.expectedBounds[i][j])>1e-5))){release(gltf.scene);throw Error('Body fallback geometry manifest');}return {scene:gltf.scene,targets,metadata:{sha256:bodySpec.sha256,bytes:bytes.length,bounds:bodySpec.expectedBounds,meshes,triangles,morphTargets:targets.length,pose:0}};}
 try{
  const head=await loader.parseAsync((await headBytes()).buffer,'');root.add(head.scene);
  const compressed=await fetchParts(spec.runtimePatch.files,null,spec.runtimePatch.compressedSha256,'groom'),url=URL.createObjectURL(new Blob([compressed]));let groom;try{groom=await loadEinarGroom36({url,compressedSha256:spec.runtimePatch.compressedSha256,sha256:spec.runtimePatch.sha256});}finally{URL.revokeObjectURL(url);}root.add(groom.mesh);
  const oralBytes=await fetchParts([spec.face.oral],null,manifest.oralSha256,'oral'),oral=await loader.parseAsync(oralBytes.buffer,'');
  // Preserve the original GLB hierarchy for exact face binding.
  head.scene.add(groom.mesh);face=await attachEinarFace37b({...spec.face,model:head.scene,groom:groom.mesh,oral:oral.scene});await attachEinarMoustache38({model:head.scene,face,...spec.moustache});
  metadata.face=face.metadata;metadata.groom=groom.metadata;
 }catch(error){draco.dispose();release(root);throw error;}
 function setExpressions(values){check();const next={...state.expressions,...values};for(const k of ['jaw','smile','brow','blink'])if(!Number.isFinite(next[k])||next[k]<0||next[k]>1)throw Error('Expression '+k+' must be in [0,1]');state.expressions=face.setExpressions(next);onChange('expressions');return copy(state.expressions);}
 async function loadBody(){check();if(bodyPromise)return bodyPromise;state.bodyStatus='loading';onChange('body-loading');bodyPromise=(async()=>{let pending;try{pending=await loadBody45({renderer,loader,spec:spec.deferredBody,fallback:spec.body45.fallback,loadOriginal,ktxTranscoderPath:new URL('./runtime/ktx-pilot/',import.meta.url).href});if(disposed){release(pending.scene);throw Error('Einar46 disposed during body load');}const attached=await attachBodyMotion42({body:pending,...spec.motionSpec});if(disposed){attached.dispose();release(pending.scene);throw Error('Einar46 disposed during motion load');}body=pending;motion=attached;root.add(body.scene);metadata.body=body.metadata;metadata.motion=motion.metadata;state.bodyStatus='ready';onChange('body-ready');return metadata.body;}catch(error){if(pending&&!body&&pending.scene.children.length)release(pending.scene);if(!disposed){state.bodyStatus='error';bodyPromise=null;onChange('body-error');}throw error;}finally{if(disposed)draco.dispose();}})();return bodyPromise;}
 function setWrist(value){check();if(!motion)throw Error('Load body before setting wrist gesture');motion.setPose(value);state.wrist=value;onChange('wrist');return value;}
 function reset(){check();setExpressions({jaw:0,smile:0,brow:0,blink:0});if(motion)setWrist(0);return copy(state);}
 function dispose(){if(disposed)return metadata.cleanup;disposed=true;state.disposed=true;motion?.dispose();motion=null;draco.dispose();metadata.cleanup=release(root);face=null;body=null;return {...metadata.cleanup};}
 return {root,capabilities,metadata,setExpressions,loadBody,setWrist,reset,getState:()=>copy(state),getBounds:()=>({head:{min:[...HEAD_MIN],max:[...HEAD_MAX],center:[...headCenter],radius:headRadius},body:body?{min:[...body.metadata.bounds[0]],max:[...body.metadata.bounds[1]]}:null}),dispose};
}
