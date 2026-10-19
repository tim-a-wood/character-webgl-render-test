import {attachEinarWalk51} from '../einar-walk51.js';
// Transport only: the immutable extension validates the combined gzip and decoded bytes.
export async function loadWalk51({dataFiles,...spec}){
 if(!Array.isArray(dataFiles)||dataFiles.length!==6||dataFiles.some(url=>typeof url!=='string'))throw Error('Walk51 requires six immutable data chunks');
 const chunks=await Promise.all(dataFiles.map(async url=>{
  const target=new URL(url,location.href);
  const response=await fetch(target,{credentials:target.origin===location.origin?'same-origin':'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('Walk51 chunk HTTP '+response.status);
  return response.arrayBuffer();
 }));
 const dataUrl=URL.createObjectURL(new Blob(chunks,{type:'application/gzip'}));
 try{return await attachEinarWalk51({...spec,dataUrl});}finally{URL.revokeObjectURL(dataUrl);}
}
