import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AUTO_SCAN_INTERVAL_MS,canSaveFirstRead,autoSaveDecision} from '../app-preview/auto-scan-policy.mjs';
const result={markers:[[80,90],[960,100],[940,1400],[70,1390]],codeConfidence:1,confidence:1,uncertain:[],sbdUnclear:false};
const base={fingerprint:'a',lastSaved:'',lastAuto:null,result,knownCode:true,knownStudent:true,now:1000};
test('clear validated four-corner sheet saves at first read',()=>{
 assert.equal(AUTO_SCAN_INTERVAL_MS,180);
 assert.equal(canSaveFirstRead(result,true,true),true);
 assert.equal(autoSaveDecision(base),'save');
});
test('uncertain/unknown/degenerate sheets need confirmation; duplicates never save',()=>{
 for(const r of [{...result,confidence:.7},{...result,uncertain:['Phần I câu 2']},{...result,sbdUnclear:true},{...result,codeConfidence:0},{...result,markers:[[0,0],[1,1],[2,2],[3,3]]},{...result,markers:[]}]){
  assert.equal(autoSaveDecision({...base,result:r}),'confirm');
 }
 assert.equal(autoSaveDecision({...base,knownStudent:false}),'confirm');
 assert.equal(autoSaveDecision({...base,knownCode:false}),'confirm');
 assert.equal(autoSaveDecision({...base,lastSaved:'a'}),'duplicate');
 assert.equal(autoSaveDecision({...base,knownStudent:false,lastAuto:{fingerprint:'a',time:900}}),'save');
 assert.equal(autoSaveDecision({...base,knownStudent:false,lastAuto:{fingerprint:'b',time:900}}),'confirm');
});
test('grading validation, duplicate history and nonawaited photo archive stay in the flow',()=>{
 const app=readFileSync('app-preview/app.mjs','utf8');
 assert.ok(app.indexOf('if(blockingIssues.length)')<app.indexOf('const decision=autoSaveDecision'));
 assert.ok(app.indexOf('const decision=autoSaveDecision')<app.indexOf('const done=saveResult(exam,student,result,true)'));
 assert.match(app,/if\(!stream\|\|captureBusy\|\|\$\('reviewDialog'\).open/);
 assert.match(app,/if\(exists&&fromAuto\)throw Error/);
 assert.match(app,/if\(done\)try\{enqueueSheetPhoto/);
 assert.equal((app.match(/setInterval\(autoScanOnce,AUTO_SCAN_INTERVAL_MS\)/g)||[]).length,2);
});
