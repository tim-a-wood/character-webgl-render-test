import {loadEinarGroom24} from './einar-groom24.js';
// Einar © Blender Foundation / Blender Studio, CC BY4.0.
// Iteration36 changes shading normals only. Source24 geometry and alpha remain exact.
export async function loadEinarGroom36(spec) {
 const result=await loadEinarGroom24(spec);
 const material=result.mesh.material, previous=material.onBeforeCompile;
 material.name='Einar36 cylindrical-normal diagnostic';
 material.onBeforeCompile=shader=>{
  previous(shader);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
varying vec3 vFiberNormal36;
varying vec3 vFiberWidth36;
varying float vFiberAcross36;`);
  const anchor='vec3 transformed=position+hairWidthFrame()*hairSignedRadius;';
  if(!shader.vertexShader.includes(anchor))throw Error('36 source24 vertex anchor missing');
  shader.vertexShader=shader.vertexShader.replace(anchor,anchor+`
vFiberNormal36=normalMatrix*normalize(cross(hairWidthFrame(),normalize(hairTangent)));
vFiberWidth36=normalMatrix*hairWidthFrame();
vFiberAcross36=sign(hairSignedRadius);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vFiberNormal36;
varying vec3 vFiberWidth36;
varying float vFiberAcross36;`);
  const fragmentAnchor='#include <normal_fragment_maps>';
  if(!shader.fragmentShader.includes(fragmentAnchor))throw Error('36 normal fragment anchor missing');
  shader.fragmentShader=shader.fragmentShader.replace(fragmentAnchor,fragmentAnchor+`
float fiberU36=clamp(vFiberAcross36,-1.0,1.0);
normal=normalize(vFiberNormal36*sqrt(max(0.0,1.0-fiberU36*fiberU36))+vFiberWidth36*fiberU36);
nonPerturbedNormal=normal;`);
  material.userData.fiberNormal36=true;
 };
 material.customProgramCacheKey=()=> 'einar36-round-fiber-normal-v1';
 result.mesh.userData.shadingNormal='view-space cylindrical cross-section, source tangent';
 result.metadata={...result.metadata,shadingNormal:result.mesh.userData.shadingNormal,diagnosticIteration:'36',sourceParity:false};
 return result;
}

