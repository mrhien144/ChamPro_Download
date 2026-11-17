import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paperCanvas,cropReviewPaper} from '../../app/paper-view.mjs';
const refs={three:[[84.5,96.5],[964.4,105.5],[944.4,1401.6],[70.4,1389.5]],'120':[[150,480],[737,485],[745,1375],[121,1375]]};
const original={width:1400,height:1400};
const at=p=>readFileSync(p,'utf8');
function mockDocument(){
 globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');const calls=[];
  const ctx={fillRect(){},save(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},setTransform(...v){assert.ok(v.every(Number.isFinite));},drawImage(...args){calls.push(args);},restore(){}};
  return {width:0,height:0,calls,getContext(){return ctx;}};
 }};
}
test('rectifies both printed forms including the header of the 120-question form',()=>{
 mockDocument();
 for(const [form,points] of Object.entries(refs)){
  const markers=points.map(([x,y])=>[350+x*.6,140+y*.6]);
  const stored={form,markers};
  const before=JSON.stringify(stored);
  const page=paperCanvas(original,stored);
  assert.ok(page,form);
  assert.equal(page.width,960);assert.equal(page.height,1440);
  assert.equal(page.calls.length,192);
  assert.ok(page.calls.every(args=>args[0]===original));
  assert.equal(JSON.stringify(stored),before);
  assert.deepEqual(original,{width:1400,height:1400});
 }
});
test('invalid markers never force a 120-question header to be cut off',()=>{
 mockDocument();
 assert.equal(cropReviewPaper(original,{form:'120',markers:[[500,500],[501,500],[501,501],[500,501]]}),null);
 assert.equal(cropReviewPaper(original,{form:'three',markers:null}),null);
 assert.equal(cropReviewPaper(original,{form:'unknown',markers:refs.three}),null);
});
test('only annotated review canvas is cropped, original JPEG and sync remain unchanged',()=>{
 const source=at('app/sheet-photo-store.mjs');
 assert.ok(source.indexOf('cropReviewPaper(c,stored)')>source.indexOf('for(const d of gradeDetails)'));
 assert.match(source,/const view=paper\|\|c/);
 assert.match(source,/max-height:none/);
 assert.ok(at('app/sw.js').includes("'./paper-view.mjs'"));
 const save=source.split('export async function showSheetPhoto')[1];
 assert.doesNotMatch(save,/putSheetPhoto\(|enqueueSheetPhoto\(|fetch\(/);
});
