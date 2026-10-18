// Generic Einar © Blender Foundation / Blender Studio, CC BY4.0.
// Five source-evaluated terms; no geometry reduction or fabricated root attachment.
export function createMoustacheMotion38(packed,buffer){
 const d=new DataView(buffer);if(d.getUint32(0,true)!==0x38334d45||d.getUint32(4,true)!==1)throw Error('Moustache38 motion header');
 const points=d.getUint32(8,true),curves=d.getUint32(12,true),base=16+(curves+1)*4;
 if(packed.length!==points*22||buffer.byteLength!==base+5*points*3*4)throw Error('Moustache38 motion size');
 const offsets=new Uint32Array(buffer,16,curves+1),delta=new Float32Array(buffer,base);if(offsets[0]!==0||offsets[curves]!==points)throw Error('Moustache38 offsets');for(let c=0;c<curves;c++)if(offsets[c+1]-offsets[c]<2)throw Error('Moustache38 short curve');for(const x of delta)if(!Number.isFinite(x))throw Error('Moustache38 nonfinite delta');
 const rest=packed.slice(),state={jaw:0,smile:0,brow:0,blink:0};let lastJ=0,lastS=0;
 function update(values={}){
  for(const k of Object.keys(state))if(values[k]!==undefined){if(!Number.isFinite(values[k]))throw Error('Moustache38 nonfinite control');state[k]=Math.max(0,Math.min(1,values[k]));}
  const j=state.jaw,s=state.smile;if(j===lastJ&&s===lastS)return false;lastJ=j;lastS=s;packed.set(rest);if(j===0&&s===0)return true;
  const weights=[j,s,2*Math.min(j,1-j),2*Math.min(s,1-s),j*s];
  for(let i=0;i<points;i++)for(let a=0;a<3;a++){let x=rest[i*22+a];for(let k=0;k<5;k++)if(weights[k])x+=delta[k*points*3+i*3+a]*weights[k];packed[i*22+a]=packed[i*22+11+a]=x;}
  for(let c=0;c<curves;c++)for(let i=offsets[c];i<offsets[c+1];i++){
   const lo=Math.max(offsets[c],i-1)*22,hi=Math.min(offsets[c+1]-1,i+1)*22;let x=packed[hi]-packed[lo],y=packed[hi+1]-packed[lo+1],z=packed[hi+2]-packed[lo+2],l=Math.hypot(x,y,z);
   if(l<1e-12){x=rest[i*22+3];y=rest[i*22+4];z=rest[i*22+5];l=Math.hypot(x,y,z)||1;}
   for(const v of [i*22,i*22+11]){packed[v+3]=x/l;packed[v+4]=y/l;packed[v+5]=z/l;}
  }return true;
 }
 return {update,state,metadata:{points,curves,deltaBytes:delta.byteLength,restCacheBytes:rest.byteLength,terms:5,sourceApproximation:true}};
}
