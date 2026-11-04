import assert from 'node:assert/strict';
import {grade,parseRows,toCsv,validateForSave} from '../app/grader.mjs';
const e={counts:{I:2,II:1,III:1},rules:{I:.25,II:[0,.1,.25,.5,1],III:.25},keys:{'101':{I:['A','B|C'],II:['ĐSĐS'],III:['2.5']}}};
let r=grade(e,{examCode:'101',I:['A','C'],II:['ĐSĐS'],III:['2,5']});assert.equal(r.total,1.75);
r=grade(e,{examCode:'101',I:['B','C'],II:['ĐS??'],III:['3']});assert.equal(r.total,.5);
assert.equal(parseRows('"họ tên","SBD"\r\n"Nguyễn, Văn A","001234"')[1][0],'Nguyễn, Văn A');
assert.equal(parseRows(toCsv([['SBD','Họ tên'],['001234','An']]))[1][0],'001234');
assert.ok(validateForSave(e,null,{sbd:'001234',examCode:'101',I:['A']}).length>0);
console.log('PASS: core scoring, CSV, safe-save checks');