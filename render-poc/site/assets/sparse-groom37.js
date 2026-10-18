// Exact source-delta sparsity only. No numerical threshold or source-point reduction.
export function createSparseGroom37(packed,restGroom,bindings){
 let activeRest=restGroom.slice();const tangentCache=new Float32Array(restGroom.length/22*3),negativeZeroPositions=[];let moving=0,curves=0;
 function tangents(target,g,mask){const {offsets,firstVertex,curveMask}=g;
  for(let c=0;c<offsets.length-1;c++){const lo=offsets[c],hi=offsets[c+1];if(mask!==null && !(curveMask[c]&mask)){for(let i=lo;i<hi;i++){const j=(firstVertex+i*2)*11,q=(firstVertex/2+i)*3;for(const p of [j,j+11]){target[p+3]=tangentCache[q];target[p+4]=tangentCache[q+1];target[p+5]=tangentCache[q+2];}}continue;}for(let i=lo;i<hi;i++){const a=(firstVertex+Math.max(lo,i-1)*2)*11,b=(firstVertex+Math.min(hi-1,i+1)*2)*11,j=(firstVertex+i*2)*11;let x=target[b]-target[a],y=target[b+1]-target[a+1],z=target[b+2]-target[a+2],l=Math.hypot(x,y,z);if(l<1e-12){x=restGroom[j+3];y=restGroom[j+4];z=restGroom[j+5];l=1}for(const p of [j,j+11]){target[p+3]=x/l;target[p+4]=y/l;target[p+5]=z/l}}}
 }
 for(const g of bindings){const {e,delta,offsets,firstVertex}=g;g.pointMask=new Uint8Array(e.count);g.curveMask=new Uint8Array(offsets.length-1);
  for(let i=0;i<e.count;i++){let mask=0;for(let k=0;k<7;k++){const a=(k*e.count+i)*3;if(delta[a]!==0||delta[a+1]!==0||delta[a+2]!==0)mask|=1<<k;}g.pointMask[i]=mask;if(mask)moving++;
   const a=(firstVertex+i*2)*11;for(const j of [a,a+11]){activeRest[j]=restGroom[j]+0;activeRest[j+1]=restGroom[j+1]+0;activeRest[j+2]=restGroom[j+2]+0;for(let d=0;d<3;d++)if(Object.is(restGroom[j+d],-0))negativeZeroPositions.push(j+d);}
  }
  for(let c=0;c<offsets.length-1;c++){let mask=0;for(let i=offsets[c];i<offsets[c+1];i++)mask|=g.pointMask[i];g.curveMask[c]=mask;if(mask)curves++;}
  tangents(activeRest,g,null);for(let i=0;i<e.count;i++){const j=(firstVertex+i*2)*11,q=(firstVertex/2+i)*3;tangentCache[q]=activeRest[j+3];tangentCache[q+1]=activeRest[j+4];tangentCache[q+2]=activeRest[j+5];}
 }
 activeRest=null;
 const metadata={unionMovingPoints:moving,unionMovingCurves:curves,cacheBytes:tangentCache.byteLength,setupTemporaryBytes:restGroom.byteLength,negativeZeroPositions:negativeZeroPositions.length,maskBytes:bindings.reduce((n,g)=>n+g.pointMask.byteLength+g.curveMask.byteLength,0),threshold:0};
 function update(w,zero){if(zero){packed.set(restGroom);metadata.lastTouchedPoints=0;metadata.lastTouchedCurves=0;metadata.lastActiveMask=0;return;}let mask=0;for(let k=0;k<7;k++)if(w[k])mask|=1<<k;packed.set(restGroom);for(const i of negativeZeroPositions)packed[i]=0;let touched=0,touchedCurves=0;
  for(const g of bindings){const {e,delta,firstVertex,pointMask}=g;
   for(let i=0;i<e.count;i++){if(!(pointMask[i]&mask))continue;touched++;let x=0,y=0,z=0;for(let k=0;k<7;k++){if(!w[k])continue;const a=(k*e.count+i)*3,f=w[k]*e.delta_scale;x+=delta[a]*f;y+=delta[a+1]*f;z+=delta[a+2]*f}const a=(firstVertex+i*2)*11;for(const j of [a,a+11]){packed[j]=restGroom[j]+x;packed[j+1]=restGroom[j+1]+y;packed[j+2]=restGroom[j+2]+z}}
   tangents(packed,g,mask);for(const m of g.curveMask)if(m&mask)touchedCurves++;
  }
  metadata.lastTouchedPoints=touched;metadata.lastTouchedCurves=touchedCurves;metadata.lastActiveMask=mask;
 }
 return {update,metadata};
}
