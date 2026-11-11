import assert from 'node:assert/strict';
import {allocateExamPoints,pointsForExam,PART_II_FIXED} from '../app-preview/compact-points.mjs';
import {grade} from '../app-preview/grader.mjs';
const counts={I:18,II:4,III:6};
const alloc=allocateExamPoints('three',counts,'4.5','1.5');
assert.deepEqual(alloc.rules.II,[0,.1,.25,.5,1]);
assert.equal(alloc.rules.I,.25);assert.equal(alloc.rules.III,.25);
assert.equal(alloc.max,10);assert.equal(alloc.totalII,4);
const changed=allocateExamPoints('three',counts,'5','1');
assert.equal(changed.max,10);
assert.equal(changed.rules.I,5/18);assert.equal(changed.rules.III,1/6);
const e={form:'three',counts,rules:changed.rules,keys:{'101':{
 I:Array(18).fill('D'),II:Array(4).fill('ĐSĐS'),III:Array(6).fill('3')
}}};
const full=grade(e,{examCode:'101',I:Array(18).fill('D'),II:Array(4).fill('ĐSĐS'),III:Array(6).fill('3')});
assert.equal(full.max,10);assert.equal(full.total,10);
assert.equal(pointsForExam(e).max,10);
assert.equal(grade(e,{examCode:'101',I:Array(18).fill('A'),II:Array(4).fill('SĐSĐ'),III:Array(6).fill('2')}).total,0);
const p120=allocateExamPoints('120',{I:120,II:0,III:0},1200,0);
assert.equal(p120.rules.I,10);assert.equal(p120.max,1200);
assert.equal(grade({form:'120',counts:{I:120,II:0,III:0},rules:p120.rules,
 keys:{'1001':{I:Array(120).fill('A'),II:[],III:[]}}},
 {examCode:'1001',I:Array(120).fill('A'),II:[],III:[]}).max,1200);
assert.throws(()=>allocateExamPoints('three',{I:0,II:4,III:6},2,1.5),/0 câu/);
assert.throws(()=>allocateExamPoints('three',counts,-5,1.5),/không âm/);
assert.deepEqual([...PART_II_FIXED],[0,.1,.25,.5,1]);
console.log('PASS: fixed Part II scoring, auto per-question allocation and 120-question maximum');
