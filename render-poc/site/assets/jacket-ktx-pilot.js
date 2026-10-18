import {KTX2Loader} from './ktx-pilot/loaders/KTX2Loader.js';
import * as THREE from 'three';
export async function installJacketKtxPilot({renderer,body,invalidate}){
 const matches=[];body.scene.traverse(o=>{for(const m of [].concat(o.material||[]))if(m.name==='Authored body PBR GEO-einar_jacket_main')matches.push({o,m});});
 if(matches.length!==1)throw Error('Expected exactly one authored jacket-main material');
 const {o,m}=matches[0], old={map:m.map,normalMap:m.normalMap,roughnessMap:m.roughnessMap,metalnessMap:m.metalnessMap};
 if(old.roughnessMap!==old.metalnessMap)throw Error('Packed MR identity differs');
 const loader=new KTX2Loader().setTranscoderPath('./assets/ktx-pilot/').setWorkerLimit(1).detectSupport(renderer);
 const specs=[['normal','normalMap','216e3e16183d6c33c0c901928cbf4c90e257df1507d03ae7be0b491560d63aaa'],['basecolor','map','a9eb042a3b01b23b1fdf9d4892a6a0fe900cc0f6bd826543321978e59c230a42'],['metalrough','roughnessMap','e219d62e6be32d4307bc5382116251272995958f64c888b8bfd6724aa8550acd']];
 const textures={},records=[];const start=performance.now();
 for(const[role,key,sha]of specs){const bytes=await(await fetch('./assets/ktx-pilot/'+role+'.ktx2')).arrayBuffer();const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(actual!==sha)throw Error('KTX hash '+role);const t=await new Promise((resolve,reject)=>loader.parse(bytes,resolve,reject));const source=old[key];if(!t.isCompressedTexture)throw Error('No compressed GPU format for '+role);const declaredColorSpace=t.colorSpace;if(role==='basecolor'?t.colorSpace!==THREE.SRGBColorSpace:![THREE.LinearSRGBColorSpace,THREE.NoColorSpace].includes(t.colorSpace))throw Error('KTX transfer mismatch '+role);t.colorSpace=source.colorSpace;
 for(const k of ['wrapS','wrapT','magFilter','minFilter','anisotropy','channel','flipY','matrixAutoUpdate','rotation'])t[k]=source[k];t.offset.copy(source.offset);t.repeat.copy(source.repeat);t.center.copy(source.center);t.matrix.copy(source.matrix);t.needsUpdate=true;textures[key]=t;
 records.push({role,sha256:sha,encodedBytes:bytes.byteLength,format:t.format,formatName:Object.keys(THREE).find(k=>k.endsWith('_Format')&&THREE[k]===t.format),colorSpace:t.colorSpace,declaredColorSpace,width:t.image.width,height:t.image.height,mipBytes:t.mipmaps.reduce((s,x)=>s+x.data.byteLength,0),mipLevels:t.mipmaps.map(x=>({width:x.width,height:x.height,bytes:x.data.byteLength})),source:{colorSpace:source.colorSpace,flipY:source.flipY,wrapS:source.wrapS,wrapT:source.wrapT,minFilter:source.minFilter,magFilter:source.magFilter,channel:source.channel}});
 }
 textures.metalnessMap=textures.roughnessMap;
 const metadata={mesh:o.name,material:m.name,records,loadTranscodeMs:performance.now()-start,workerConfig:loader.workerConfig,extensions:renderer.getContext().getSupportedExtensions(),note:'Overlay retains original PNGs and original GPU textures for exact A/B reset. Mip bytes are compressed payload residency estimate, not measured total driver memory or net saving in this diagnostic.'};
 const setEnabled=value=>{Object.assign(m,value==='mixed'?{...textures,normalMap:old.normalMap}:value?textures:old);m.needsUpdate=true;invalidate('jacket-ktx-toggle');};
 return {metadata,setEnabled,dispose(){setEnabled(false);for(const t of new Set(Object.values(textures)))t.dispose();loader.dispose();}};
}
