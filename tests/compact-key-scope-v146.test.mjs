import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseChoiceII,serializeChoiceII} from '../app-preview/visual-answer-model.mjs';
import {grade} from '../app-preview/grader.mjs';

const editor=readFileSync(new URL('../app-preview/compact-answer-ui.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../app-preview/styles.css',import.meta.url),'utf8');
const apkCss=readFileSync(new URL('../android-build/native-app.css',import.meta.url),'utf8');
const review=readFileSync(new URL('../app-preview/result-review-ui.mjs',import.meta.url),'utf8');
const camera=readFileSync(new URL('../app-preview/omr-native.mjs',import.meta.url),'utf8');
assert.match(editor,/cp-key-part-/, 'Only exam key rows get new layout class');
assert.match(editor,/data-cp-question/, 'Exam-key DOM still uses existing save handler');
assert.match(editor,/data-cp-short-add/, 'Short-answer add action remains');
assert.match(editor,/cp-ii-answer-options/, 'Every II subpart retains distinct T/F controls');
assert.match(css,/#page-exams #keyEditor #cpKeyGrid/, 'Web styles scoped to answer keys');
assert.match(apkCss,/#page-exams #keyEditor #cpKeyGrid/, 'APK styles scoped to answer keys');
assert.ok(!css.split('/* v14.6 – ONLY')[1].includes('#page-scan'), 'Web style not scoped to scanner');
assert.ok(!apkCss.split('/* v14.6 – ONLY')[1].includes('#page-scan'), 'APK style not scoped to scanner');
assert.ok(review.includes('renderResultEditor'), 'Student review preserved');
assert.ok(camera.includes('readSheet')||camera.includes('export'), 'Scanner module remains available');
const both=parseChoiceII('Đ*SĐ');
assert.equal(both.columns[1].trueValue,true);
assert.equal(both.columns[1].falseValue,true);
assert.equal(serializeChoiceII(both.columns),'Đ*SĐ');
const e={counts:{I:0,II:1,III:0},rules:{II:[0,.1,.25,.5,1]},keys:{'101':{I:[],II:['****'],III:[]}}};
const score=s=>grade(e,{examCode:'101',I:[],II:[s],III:[]}).points.II;
for (const [answer,expected] of [['????',0],['Đ???',.1],['ĐS??',.25],['ĐSĐ?',.5],['ĐSĐS',1],['SSSS',1],['',0],['XXXX',0]]) {
 assert.equal(score(answer),expected,answer);
}
console.log('PASS v14.6 key-only scope and T/F scoring regression');
