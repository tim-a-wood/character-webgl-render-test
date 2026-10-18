import {loadEinarGroom36} from './einar-groom36.js';
import {createMoustacheMotion38} from './moustache-motion38.js';
// Einar © Blender Foundation / Blender Studio, CC BY4.0.
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export async function attachEinarMoustache38({model,face,geometry,motion}){
 const result=await loadEinarGroom36(geometry);const mesh=result.mesh;mesh.name='Einar38 authored moustache';mesh.material.name='Einar38 moustache source colour cylindrical normals';
 const res=await fetch(motion.url);if(!res.ok)throw Error('Moustache38 motion fetch '+res.status);const zip=await res.arrayBuffer();if(await hash(zip)!==motion.compressedSha256)throw Error('Moustache38 compressed motion hash');const buffer=await new Response(new Blob([zip]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(await hash(buffer)!==motion.sha256)throw Error('Moustache38 decoded motion hash');
 const control=createMoustacheMotion38(mesh.geometry.attributes.position.data.array,buffer);model.add(mesh);
 const metadata={...result.metadata,...control.metadata,sourceCurves:7566,sourcePoints:75660,geometrySha256:geometry.sha256,motionSha256:motion.sha256,sourceParity:false,rawHeldoutMaxM:.001222125,rawHeldoutP95M:.000250956,approximation:'Five source-evaluated moustache terms; unchanged brow/blink; source-index random substitute;36 portable shading'};
 mesh.userData={...mesh.userData,...metadata};const originalSet=face.setExpressions.bind(face);
 face.setExpressions=values=>{const started=performance.now(),state=originalSet(values),mstart=performance.now();const changed=control.update(state);if(changed)mesh.geometry.attributes.position.data.needsUpdate=true;metadata.lastUpdateMs=performance.now()-mstart;metadata.state={...state};metadata.zeroRestored=state.jaw===0&&state.smile===0;face.metadata.moustache38=metadata;face.metadata.lastCombinedUpdateMs=performance.now()-started;return state;};
 face.metadata.moustache38=metadata;face.setExpressions(face.state);return {mesh,metadata,face};
}
