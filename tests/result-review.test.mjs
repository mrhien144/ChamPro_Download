import assert from 'node:assert/strict';
import {shortCellMarks,regradeAffectedResults,correctedRecord} from '../app/result-review.mjs';
import {grade} from '../app/grader.mjs';

function actual(marks){return marks.map(x=>[x.column,x.digit,x.color]);}
assert.deepEqual(actual(shortCellMarks('134','134')),
 [[0,'1','green'],[1,'3','green'],[2,'4','green']]);
assert.deepEqual(actual(shortCellMarks('124','134')),
 [[0,'1','green'],[1,'2','red'],[1,'3','yellow'],[2,'4','green']]);
assert.deepEqual(actual(shortCellMarks('124','134',['1','2','4',''])),
 [[0,'1','green'],[1,'2','red'],[1,'3','yellow'],[2,'4','green']]);
assert.deepEqual(actual(shortCellMarks('134','134',['','1','3','4'])),
 [[1,'1','green'],[2,'3','green'],[3,'4','green']]);
assert.deepEqual(actual(shortCellMarks('','3')),
 [[0,'3','yellow']], 'A blank response must show the answer in the first column');
assert.deepEqual(actual(shortCellMarks('4','3')),
 [[0,'4','red'],[0,'3','yellow']], 'A single-digit wrong answer must be left-anchored');
assert.deepEqual(actual(shortCellMarks('3','3',['','','3',''])),
 [[2,'3','red'],[0,'3','yellow']], 'The answer must never shift to match a wrong scan');
assert.equal(shortCellMarks('1,5','1,5').length,0);
assert.equal(shortCellMarks('','134').length,0);

const exam={id:'ex',digits:3,form:'three',counts:{I:2,II:1,III:1},
 rules:{I:.25,II:[0,.1,.25,.5,1],III:.25},
 keys:{'101':{I:['A','B'],II:['ĐSĐS'],III:['134']},
       '102':{I:['D','D'],II:['SĐSĐ'],III:['124']}}};
const a={id:'s1',sbd:'1234',name:'Student TEST',classroom:'12TEST'};
const b={id:'s2',sbd:'5678',name:'Student TEST 2',classroom:'12TEST'};
const answers={I:['A','B'],II:['ĐSĐS'],III:['124'],IIIColumns:[['1','2','4','']]};
const initial=grade(exam,{examCode:'101',...answers});
const old={id:'r1',examId:'ex',studentId:'s1',studentName:a.name,sbd:a.sbd,
 examCode:'101',answers,score:initial.total,max:initial.max,parts:initial.points,rawSbd:'1234'};
const data={results:[old],students:[a,b]};
assert.equal(initial.total,1.5);
exam.keys['101'].III=['124'];
let st=regradeAffectedResults(data,exam,'Sửa đáp án','101');
assert.deepEqual(st,{checked:1,changed:1,skipped:0});
assert.equal(old.score,1.75);
assert.equal(old.scoreHistory.length,1);
st=regradeAffectedResults(data,exam,'Sửa đáp án','101');
assert.equal(st.changed,0);
let out=correctedRecord(data,exam,old,{
 sbd:'5678',studentId:'s2',examCode:'102',
 answers:{I:['D','D'],II:['SĐSĐ'],III:['124'],IIIColumns:[['1','2','4','']]}}
);
assert.equal(out.changed,true);
assert.equal(out.record.studentId,'s2');
assert.equal(out.record.examCode,'102');
assert.equal(out.record.score,1.75);
assert.equal(out.record.machineReadOriginal.examCode,'101');
assert.deepEqual(out.record.answers.IIIColumns[0],['1','2','4','']);
assert.equal(out.record.scoreHistory.length,2);
assert.equal(old.sbd,'1234','original must not mutate before saving');
assert.throws(()=>correctedRecord(data,exam,old,{
 sbd:'0000',studentId:'s1',examCode:'102',
 answers:{I:['D','D'],II:['SĐSĐ'],III:['124'],IIIColumns:[['1','2','4','']]}}
),/SBD không khớp/);
assert.throws(()=>correctedRecord(data,exam,old,{
 sbd:'1234',studentId:'s1',examCode:'999',
 answers:{I:['D','D'],II:['SĐSĐ'],III:['124'],IIIColumns:[['1','2','4','']]}}
),/Mã đề/);
assert.throws(()=>correctedRecord(data,exam,old,{
 sbd:'1234',studentId:'s1',examCode:'101',
 answers:{I:['D','D'],II:['SĐSĐ'],III:['124'],IIIColumns:[['1','2','3','']]}}
),/không khớp/);
console.log('PASS: short-answer bubble colours, automatic regrading, manual corrections and history');