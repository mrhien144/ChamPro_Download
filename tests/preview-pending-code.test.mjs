import assert from 'node:assert/strict';
import {grade} from '../app-preview/grader.mjs';
import {correctedRecord,regradeAffectedResults} from '../app-preview/result-review.mjs';
import {makeReport,groupKey} from '../app-preview/multisubject.mjs';
const exam={id:'exam',name:'Test',gradeClass:'12A',subject:'Sinh học',digits:3,form:'three',
 counts:{I:2,II:0,III:0},keys:{'101':{I:['A','B'],II:[],III:[]}},
 rules:{I:0.25,II:[0,.1,.25,.5,1],III:0.25}};
const student={id:'student',sbd:'1234',name:'Học sinh Test',classroom:'12A'};
const pending={id:'r1',examId:'exam',studentId:student.id,studentName:student.name,
 sbd:'1234',rawSbd:'1234',examCode:'999',pendingCode:true,
 score:null,max:null,parts:{I:null,II:null,III:null},
 answers:{I:['A','B'],II:[],III:[],IIIColumns:[]},savedAt:'2026-11-11T00:00:00.000Z'};
const data={exams:[exam],students:[student],results:[pending]};
assert.equal(makeReport(data,groupKey(exam)).rows[0].scores['Sinh học'],null,
 'Pending paper must not be reported as a zero score');
assert.throws(()=>grade(exam,{...pending.answers,examCode:'999'}),/Không có bộ đáp án/);
const correction=correctedRecord(data,exam,pending,{sbd:'1234',studentId:'student',examCode:'101',
 answers:{I:['A','B'],II:[],III:[],IIIColumns:[ ]}});
assert.equal(correction.changed,true);
assert.equal(correction.record.pendingCode,false);
assert.equal(correction.record.score,0.5);
assert.equal(correction.record.machineReadOriginal.examCode,'999');
assert.equal(correction.record.machineReadOriginal.answers.I[0],'A');
assert.equal(correction.record.scoreHistory.length,1);
data.results[0]=correction.record;
assert.equal(makeReport(data,groupKey(exam)).rows[0].scores['Sinh học'],0.5);
const pending2={...pending,id:'r2',studentId:null,sbd:'',studentName:'Chưa xác định'};
data.results=[pending2];
exam.keys['999']={I:['A','B'],II:[],III:[]};
const stats=regradeAffectedResults(data,exam,'Bổ sung đáp án','999');
assert.equal(stats.checked,1);
assert.equal(stats.changed,1);
assert.equal(pending2.pendingCode,false);
assert.equal(pending2.score,0.5);
console.log('PASS: pending code, no false zero, correction, original read, regrade');
