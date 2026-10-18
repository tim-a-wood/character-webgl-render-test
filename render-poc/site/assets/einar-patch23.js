import * as THREE from 'three';
// Generic Einar © Blender Foundation / Blender Studio, CC BY4.0.
// Isolated23 runtime. Earlier GLBs and materials are unchanged.
export async function loadEinarPatch23({url,sha256}) {
 const response=await fetch(url);if(!response.ok)throw new Error('Patch23 fetch failed '+response.status);
 const buffer=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==sha256)throw new Error('Patch23 hash mismatch');
 const header=new DataView(buffer);if(header.getUint32(0,true)!==0x33325045||header.getUint32(4,true)!==1)throw new Error('Patch23 invalid header');
 const vertices=header.getUint32(8,true),indices=header.getUint32(12,true);if(buffer.byteLength!==16+vertices*44+indices*4||indices%3)throw new Error('Patch23 invalid length');
 const packed=new Float32Array(buffer,16,vertices*11);for(const x of packed)if(!Number.isFinite(x))throw new Error('Patch23 nonfinite attribute');
 const ib=new THREE.InterleavedBuffer(packed,11),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.InterleavedBufferAttribute(ib,3,0));g.setAttribute('hairTangent',new THREE.InterleavedBufferAttribute(ib,3,3));g.setAttribute('hairSignedRadius',new THREE.InterleavedBufferAttribute(ib,1,6));g.setAttribute('color',new THREE.InterleavedBufferAttribute(ib,4,7));
 const idx=new Uint32Array(buffer,16+vertices*44,indices);for(const i of idx)if(i>=vertices)throw new Error('Patch23 index out of bounds');g.setIndex(new THREE.BufferAttribute(idx,1));const normals=new Float32Array(vertices*3);for(let i=0;i<vertices;i++)normals[i*3+1]=1;g.setAttribute('normal',new THREE.BufferAttribute(normals,3));
 g.computeBoundingBox();let radius=0;for(let i=0;i<vertices;i++)radius=Math.max(radius,Math.abs(packed[i*11+6]));g.boundingBox.expandByScalar(radius);g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
 const cameraLocal={value:new THREE.Vector3()};const m=new THREE.MeshStandardMaterial({name:'Einar23 view-facing source strand colour',vertexColors:true,roughness:.35,metalness:0,side:THREE.DoubleSide,transparent:false,depthWrite:true,alphaTest:0,alphaHash:true});
 m.onBeforeCompile=shader=>{shader.uniforms.hairCameraLocal=cameraLocal;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 hairTangent;\nattribute float hairSignedRadius;\nuniform vec3 hairCameraLocal;\nvec3 hairWidthFrame(){vec3 t=normalize(hairTangent);vec3 ray=normalize(hairCameraLocal-position);vec3 w=cross(t,ray);if(dot(w,w)<1e-10){w=cross(t,vec3(0.0,1.0,0.0));if(dot(w,w)<1e-10)w=cross(t,vec3(1.0,0.0,0.0));}return normalize(w);}')
 .replace('#include <beginnormal_vertex>','vec3 objectNormal=normalize(cross(hairWidthFrame(),normalize(hairTangent)));')
 .replace('#include <begin_vertex>','vec3 transformed=position+hairWidthFrame()*hairSignedRadius;');m.userData.shaderCompiled=true;};
 m.customProgramCacheKey=()=> 'einar23-view-facing-v1';const mesh=new THREE.Mesh(g,m);mesh.name='Einar23 source under-chin patch';mesh.frustumCulled=false;mesh.onBeforeRender=(_r,_s,camera)=>{camera.getWorldPosition(cameraLocal.value);mesh.worldToLocal(cameraLocal.value);};mesh.userData={sourceCurves:602,triangles:indices/3,sha256:hash,representation:'camera-facing source-following ribbons',sourceAlpha:'vertex alpha with alphaHash',standaloneGLB:false};
 return {mesh,metadata:{...mesh.userData,bytes:buffer.byteLength,vertices,threeRevision:THREE.REVISION,bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()]}};
}
