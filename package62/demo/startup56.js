// A failed WebGL initialization must not leave apparently usable load controls.
export function createRendererOrReport56({createRenderer,document}){
 try{return createRenderer();}catch(error){
  const status=document.getElementById('status');
  status.textContent='3D rendering is unavailable in this browser. WebGL could not start. Try this private link in a browser with WebGL support.';
  status.setAttribute('role','alert');
  document.getElementById('player-state').textContent='Playback unavailable: WebGL initialization failed.';
  document.getElementById('capabilities').textContent='No character assets have been requested. Rendering initialization failed: '+(error?.message||String(error));
  for(const control of document.querySelectorAll('button,input,fieldset'))control.disabled=true;
  return null;
 }
}
