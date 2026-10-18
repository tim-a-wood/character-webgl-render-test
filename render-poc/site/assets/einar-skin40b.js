import * as THREE from 'three';
// Generic Einar © Blender Foundation / Blender Studio, CC BY4.0.
// Diffuse-only separable diffusion experiment. Technique: Jimenez/Gutierrez Separable SSS;
// accompanying SSS-LICENSE.txt retains their notice. This is an approximation, not Random Walk.
export function installEinarSkin40({renderer,scene,camera,model}){
 if(THREE.REVISION!=='160')throw Error('Skin40 requires audited Three r160');
 const gl=renderer.getContext();if(!renderer.capabilities.isWebGL2||!gl.getExtension('EXT_color_buffer_float'))throw Error('Skin40 requires WebGL2 float colour targets');
 const samples=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES));
 if(gl.getParameter(gl.MAX_DRAW_BUFFERS)<5||gl.getParameter(gl.MAX_COLOR_ATTACHMENTS)<5||!samples.includes(4))throw Error('Skin40 requires five attachments and four-sample RGBA16F');
 if(renderer.toneMapping!==THREE.ACESFilmicToneMapping||renderer.outputColorSpace!==THREE.SRGBColorSpace)throw Error('Skin40 requires unchanged ACES/sRGB baseline');
 const originalRender=renderer.render.bind(renderer),capture={value:false},exposure={value:renderer.toneMappingExposure};
 const materials=new Map(),hooks=[];let frameInitialized=false,transmissionInitialized=false,inPipeline=false;let headCount=0;model.traverse(o=>{if(!o.isMesh)return;hooks.push([o,o.onBeforeRender]);const skin=/einar_head/i.test(o.name);if(skin)headCount++;for(const m of [].concat(o.material)){if(materials.has(m)&&materials.get(m).skin!==skin)throw Error('Skin40 shared skin material');materials.set(m,{skin,before:m.onBeforeCompile,key:m.customProgramCacheKey,cache:m.customProgramCacheKey()});}});
 if(headCount!==1)throw Error('Skin40 requires exactly one known head mesh');
 const declarations=`
uniform bool skinCapture40;
#ifndef TONE_MAPPING
#include <tonemapping_pars_fragment>
#endif
layout(location=1) out highp vec4 skinIrradiance40;
layout(location=2) out highp vec4 skinNormalDepth40;
layout(location=3) out highp vec4 skinAlbedo40;
layout(location=4) out highp vec4 skinLinearBeauty40;
vec2 skinOct40(vec3 n){n/=abs(n.x)+abs(n.y)+abs(n.z);vec2 p=n.xy;if(n.z<0.0)p=(1.0-abs(p.yx))*sign(p.xy);return p*0.5+0.5;}
`;
 for(const [m,r] of materials){
  m.onBeforeCompile=function(shader,render){r.before.call(this,shader,render);shader.uniforms.skinCapture40=capture;shader.uniforms.toneMappingExposure=exposure;shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>'+declarations);
   const anchor='#include <opaque_fragment>';if(!shader.fragmentShader.includes(anchor))throw Error('Skin40 unsupported material output '+m.name);
   if(r.skin&&!shader.fragmentShader.includes('vec3 totalDiffuse ='))throw Error('Skin40 missing PBR diffuse separation');
   const aux=r.skin?`vec3 a40=sqrt(max(diffuseColor.rgb,vec3(0.0001)));skinIrradiance40=vec4(totalDiffuse/a40,1.0);skinNormalDepth40=vec4(skinOct40(normal),1.0,vViewPosition.z);skinAlbedo40=vec4(a40,1.0);`:`skinIrradiance40=vec4(0.0,0.0,0.0,1.0);skinNormalDepth40=vec4(0.0,0.0,0.0,1.0);skinAlbedo40=vec4(0.0,0.0,0.0,1.0);`;
   shader.fragmentShader=shader.fragmentShader.replace(anchor,anchor+`\n${aux}\nskinLinearBeauty40=gl_FragColor;`)
   .replace('#include <tonemapping_fragment>',`if(skinCapture40){${m.toneMapped?'gl_FragColor.rgb=ACESFilmicToneMapping(gl_FragColor.rgb);':''}}else{\n#include <tonemapping_fragment>\n}`)
   .replace('#include <colorspace_fragment>','if(skinCapture40){gl_FragColor=sRGBTransferOETF(gl_FragColor);}else{\n#include <colorspace_fragment>\n}');
   m.userData.skinMrt40=true;
  };m.customProgramCacheKey=()=>r.cache+'|skin-mrt40b-v1-'+r.skin;m.needsUpdate=true;
 }
 const options={format:THREE.RGBAFormat,type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true,stencilBuffer:false};
 const mrt=new THREE.WebGLMultipleRenderTargets(1,1,5,options);mrt.samples=4;
 mrt.texture.forEach((t,i)=>{t.type=i===0?THREE.UnsignedByteType:THREE.HalfFloatType;t.internalFormat=i===0?'RGBA8':'RGBA16F';t.colorSpace=THREE.NoColorSpace;t.generateMipmaps=false;t.name='Skin40 '+i;});
 const ping=new THREE.WebGLRenderTarget(1,1,{...options,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false}),pong=ping.clone();mrt.texture[1].minFilter=mrt.texture[1].magFilter=THREE.LinearFilter;
 const triangle=new THREE.BufferGeometry();triangle.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));triangle.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
 const quadScene=new THREE.Scene(),quadCamera=new THREE.Camera(),quad=new THREE.Mesh(triangle);quad.frustumCulled=false;quadScene.add(quad);
 const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}';
 const offsets=[-1,-.6,-.3,-.12,-.04,0,.04,.12,.3,.6,1],sigma=[1/3,.2/3,.1/3];
 const weights=offsets.map((x,i)=>sigma.map(s=>Math.exp(-.5*(x/s)**2)*((i===offsets.length-1?1:(x+offsets[i+1])/2)-(i===0?-1:(x+offsets[i-1])/2))));
 for(let c=0;c<3;c++){const sum=weights.reduce((a,w)=>a+w[c],0);for(const w of weights)w[c]/=sum;}
 const shared={source:{value:null},meta:{value:mrt.texture[2]},direction:{value:new THREE.Vector2()},supportM:{value:.006},projection:{value:new THREE.Vector2()},kernel:{value:weights.map(w=>new THREE.Vector3(...w))}};
 const blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:shared,vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform sampler2D source,meta;uniform vec2 direction,projection;uniform float supportM;uniform vec3 kernel[11];
vec3 decodeOct(vec2 e){vec2 f=e*2.0-1.0;vec3 n=vec3(f,1.0-abs(f.x)-abs(f.y));float t=clamp(-n.z,0.0,1.0);n.xy+=vec2(n.x>=0.0?-t:t,n.y>=0.0?-t:t);return normalize(n);}
void main(){vec4 center=texture2D(source,vUv),m=texture2D(meta,vUv);if(m.z<0.999||m.w<=0.0){gl_FragColor=center;return;}vec3 n=decodeOct(m.xy),sum=vec3(0.0);vec2 stepUv=direction*projection*supportM/m.w;float positions[11];${offsets.map((x,i)=>`positions[${i}]=${x.toFixed(6)};`).join('')}
for(int i=0;i<11;i++){vec2 q=vUv+positions[i]*stepUv;vec4 other=texture2D(meta,q);float guard=step(0.999,other.z)*exp(-pow((other.w-m.w)/(2.0*supportM),2.0))*pow(max(dot(n,decodeOct(other.xy)),0.0),8.0);vec3 c=mix(center.rgb,texture2D(source,q).rgb,guard);sum+=kernel[i]*c;}gl_FragColor=vec4(sum,center.a);}`});
 const composite=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{beauty:{value:mrt.texture[0]},irradiance:{value:mrt.texture[1]},meta:{value:mrt.texture[2]},albedo:{value:mrt.texture[3]},linearBeauty:{value:mrt.texture[4]},filtered:{value:pong.texture},enabled:{value:false},toneMappingExposure:exposure},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform sampler2D beauty,irradiance,meta,albedo,linearBeauty,filtered;uniform bool enabled;
#include <tonemapping_pars_fragment>
void main(){vec4 base=texture2D(beauty,vUv),m=texture2D(meta,vUv);if(!enabled||m.z<0.999){gl_FragColor=base;return;}vec3 correction=(texture2D(filtered,vUv).rgb-texture2D(irradiance,vUv).rgb)*texture2D(albedo,vUv).rgb;vec3 value=texture2D(linearBeauty,vUv).rgb+correction;gl_FragColor=sRGBTransferOETF(vec4(ACESFilmicToneMapping(max(value,vec3(0.0))),base.a));}`});
 let mode='historical',disposed=false,width=0,height=0;const size=new THREE.Vector2();
 const metadata={method:'Skin-only separable diffusion of diffuse irradiance with square-root albedo split; sharp specular retained',sourceRadiiM:[.006,.0012,.0006],kernelSupportM:.006,kernelSigmaM:[.002,.0004,.0002],kernelInterpretation:'Source RGB distances used as finite filter support, not an exact Random Walk diffusion profile',offsets,weights,samples:4,maxDrawBuffers:gl.getParameter(gl.MAX_DRAW_BUFFERS),rgba16fSamples:samples,threeRevision:THREE.REVISION,sourceParity:false,mode};
 for(const [o,previous] of hooks)o.onBeforeRender=function(...args){previous.apply(this,args);capture.value=renderer.getRenderTarget()===mrt;if(inPipeline&&!capture.value&&!transmissionInitialized&&renderer.getRenderTarget()&&renderer.toneMapping===THREE.NoToneMapping){transmissionInitialized=true;if(!scene.background?.isColor||renderer.getClearAlpha()!==1)throw Error('Skin40b transmission clear requires audited opaque colour background');const encoded=scene.background.clone().convertLinearToSRGB();metadata.transmissionClearBefore=Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE));metadata.transmissionClearHistorical=[...encoded.toArray(),1];renderer.state.buffers.color.setMask(true);gl.clearBufferfv(gl.COLOR,0,new Float32Array(metadata.transmissionClearHistorical));}if(capture.value&&!frameInitialized){frameInitialized=true;renderer.state.buffers.color.setMask(true);renderer.state.buffers.depth.setMask(true);const bg=scene.background?.isColor?scene.background.clone().convertLinearToSRGB():new THREE.Color(0);gl.clearBufferfv(gl.COLOR,0,new Float32Array([...bg.toArray(),1]));for(let i=1;i<5;i++)gl.clearBufferfv(gl.COLOR,i,new Float32Array(4));gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));metadata.actualSamples=gl.getParameter(gl.SAMPLES);metadata.sampleBuffers=gl.getParameter(gl.SAMPLE_BUFFERS);if(metadata.actualSamples!==4)throw Error('Skin40 expected four actual samples');}};
 function render(s,c){
  if(disposed||s!==scene||c!==camera||mode==='historical'){capture.value=false;return originalRender(s,c);}
  const savedTarget=renderer.getRenderTarget(),savedBackground=scene.background,savedAuto=renderer.autoClear,savedScissor=renderer.getScissorTest();renderer.getDrawingBufferSize(size);
  if(width!==size.x||height!==size.y){width=size.x;height=size.y;mrt.setSize(width,height);ping.setSize(width,height);pong.setSize(width,height);metadata.size=[width,height];metadata.targetBytesEstimate=width*height*((4+4*8)*5+2*8+4*4);}
  const started=performance.now(),draws={triangles:0,calls:0};const count=()=>{draws.triangles+=renderer.info.render.triangles;draws.calls+=renderer.info.render.calls;};try{
   capture.value=false;frameInitialized=false;transmissionInitialized=false;inPipeline=true;exposure.value=renderer.toneMappingExposure;renderer.setScissorTest(false);renderer.setRenderTarget(mrt);renderer.autoClear=true;
   originalRender(scene,camera);count();metadata.framebufferStatus=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
   if(metadata.framebufferStatus!==gl.FRAMEBUFFER_COMPLETE)throw Error('Skin40 incomplete MRT');
   capture.value=false;
   shared.projection.value.set(camera.projectionMatrix.elements[0]*.5,camera.projectionMatrix.elements[5]*.5);metadata.projection=shared.projection.value.toArray();metadata.cameraDistance=camera.position.length();metadata.fov=camera.fov;
   if(mode==='diffusion'){quad.material=blur;shared.source.value=mrt.texture[1];shared.direction.value.set(1,0);renderer.setRenderTarget(ping);originalRender(quadScene,quadCamera);count();shared.source.value=ping.texture;shared.direction.value.set(0,1);renderer.setRenderTarget(pong);originalRender(quadScene,quadCamera);count();}
   composite.uniforms.enabled.value=mode==='diffusion';quad.material=composite;renderer.setRenderTarget(savedTarget);originalRender(quadScene,quadCamera);count();metadata.lastSubmitMs=performance.now()-started;metadata.glError=gl.getError();metadata.draws=draws;
  }finally{capture.value=false;inPipeline=false;scene.background=savedBackground;renderer.autoClear=savedAuto;renderer.setScissorTest(savedScissor);renderer.setRenderTarget(savedTarget);}
 }
 renderer.render=render;
 return {metadata,setMode(value){if(!['historical','zero','diffusion'].includes(value))throw Error('Skin40 invalid mode');mode=value;metadata.mode=value;},dispose(){disposed=true;renderer.render=originalRender;for(const [o,previous] of hooks)o.onBeforeRender=previous;for(const [m,r]of materials){m.onBeforeCompile=r.before;m.customProgramCacheKey=r.key;m.needsUpdate=true;}mrt.dispose();ping.dispose();pong.dispose();triangle.dispose();blur.dispose();composite.dispose();}};
}
