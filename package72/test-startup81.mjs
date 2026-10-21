import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './vendor/three/build/three.module.js';
import {frameStatistics,summarize} from './metrics72.js';
const source=fs.readFileSync(new URL('./viewer81-jog.js',import.meta.url),'utf8');
assert.ok(source.includes("fetch('./runtime81-jog.json'"));
assert.ok(!source.includes('./runtime80-jog.json'));
function extract(s,name){const start=s.indexOf('function '+name+'('),end=s.indexOf('\nfunction ',start+1);assert.ok(start>=0&&end>start);return s.slice(start,end).trim();}
// Startup polling may call the real report() before fetch resolves, after config
// resolves but before GLB parsing, and after a failed load. Exercise those states.
vm.runInNewContext(`
let config,clip,action;const metrics={ready:false,controls:[],frameSamples:[]};
const playing=false,neutral=true,clipTime=0,loopElapsed80=0,loopCompleted80=0,attributes=[];
const camera=new THREE.PerspectiveCamera(32,1,.01,1000),controls={target:new THREE.Vector3()},drawStats=()=>({calls:0,triangles:0});
const performance={getEntriesByType:()=>[]};
${extract(source,'isLoopingJog80')}
${extract(source,'report')}
for(const state of [undefined,{}, {jog:{}}, {jog:{clip:'JogCycleTest',loopMode:'repeat',loopValidation:{approved:true}}}]){
 config=state;clip=undefined;const r=report();assert.equal(r.ready,false);assert.equal(r.loopState80.active,false);assert.equal(r.selectedClip,undefined);
}
config=undefined;clip={name:'JogCycleTest'};assert.equal(report().loopState80.active,false);
config={jog:{clip:'JogCycleTest',loopMode:'repeat',loopValidation:{approved:true}}};assert.equal(report().loopState80.active,true);
config.jog.loopValidation.approved=false;assert.equal(report().loopState80.active,false);
clip=undefined;config=undefined;metrics.failure='Synthetic configuration fetch failure';assert.equal(report().failure,metrics.failure);assert.equal(report().loopState80.active,false);
`,{THREE,assert,frameStatistics,summarize});
console.log('LOOP81_STARTUP_REPORT_PASS: real report() is safe before config, during partial loading, and after a failed load.');
