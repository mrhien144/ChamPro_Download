import assert from 'node:assert/strict';
import {grade} from '../app-preview/grader.mjs';
import {parseChoiceI,serializeChoiceI,parseChoiceII,serializeChoiceII,parseChoiceIII,serializeChoiceIII} from '../app-preview/visual-answer-model.mjs';
assert.deepEqual(parseChoiceI('A|C'),{all:false,choices:['A','C']});
assert.equal(serializeChoiceI(['A','C']), 'A|C');
assert.equal(serializeChoiceI(['B'],true), 'ALL');
assert.deepEqual(parseChoiceII('Đ*SS').columns[1],{trueValue:true,falseValue:true});
assert.equal(serializeChoiceII(parseChoiceII('Đ*SS').columns),'Đ*SS');
assert.equal(serializeChoiceII(parseChoiceII('D*SD').columns),'Đ*SĐ');
assert.equal(serializeChoiceII(parseChoiceII('ALL').columns,true),'ALL');
assert.equal(serializeChoiceII([{trueValue:true,falseValue:false},{trueValue:false,falseValue:true},{trueValue:true,falseValue:true},{trueValue:false,falseValue:true}]),'ĐS*S');
assert.deepEqual(parseChoiceIII('4826|8264').values,['4826','8264']);
assert.equal(serializeChoiceIII(['4826','8264','4826']),'4826|8264');
assert.equal(serializeChoiceIII([],true),'ALL');
const exam={
 id:'e',counts:{I:1,II:1,III:1},
 rules:{I:.25,II:[0,.1,.25,.5,1],III:.25},
 keys:{'101':{I:['A|C'],II:['Đ*ĐS'],III:['4826|8264']}}
};
const score=(partII,partI='A',partIII='4826')=>grade(exam,{examCode:'101',I:[partI],II:[partII],III:[partIII]});
assert.equal(score('ĐĐĐS').total,1.5); // a Đ; b accepts Đ or S; c Đ; d S
assert.equal(score('ĐSĐS').total,1.5);
assert.equal(score('ĐĐĐĐ').points.II,.5); // 3 accepted ý
assert.equal(score('ĐĐSS').points.II,.5); // 3 accepted ý
assert.equal(score('ĐĐSS','B','1111').total,.5); // 3 accepted, others wrong
assert.equal(score('ĐĐSĐ').points.II,.25);
assert.equal(score('SĐSS').points.II,.25);
assert.equal(score('SSSĐ').points.II,.1); // only b is accepted
assert.equal(score('????').points.II,0); // no bubble => no credit, including override
assert.equal(score('Đ?ĐS').points.II,.5);
assert.equal(score('ĐĐĐS','C','8264').total,1.5);

assert.equal(score('ĐĐĐS','A').points.I,.25,'Phần I: học sinh chỉ tô A trong A|C có điểm');
assert.equal(score('ĐĐĐS','C').points.I,.25,'Phần I: học sinh chỉ tô C trong A|C có điểm');
assert.equal(score('ĐĐĐS','B').points.I,0,'Phần I: B không thuộc A|C không điểm');
assert.equal(score('ĐĐĐS','D').points.I,0,'Phần I: D không thuộc A|C không điểm');
assert.equal(score('ĐĐĐS','A+C').points.I,0,'Phần I: tô cả hai A và C không điểm');
assert.equal(score('ĐĐĐS','A+B').points.I,0,'Phần I: tô nhiều ô không hợp lệ không điểm');
assert.equal(score('ĐĐĐS','').points.I,0,'Phần I: bỏ trống không điểm');
assert.equal(score('ĐĐĐS').points.II,1,'Phần II: cả bốn ý đúng thì được 1 điểm');
assert.equal(score('ĐSĐS').points.II,1,'Phần II: b chọn Sai cũng được đủ điểm');
assert.equal(score('ĐĐĐĐ').points.II,.5,'Phần II: ba ý đúng được 0.5 điểm');
assert.equal(score('ĐĐSĐ').points.II,.25,'Phần II: hai ý đúng được 0.25 điểm');
assert.equal(score('SSSĐ').points.II,.1,'Phần II: một ý đúng được 0.1 điểm');
assert.equal(score('????').points.II,0,'Phần II: bỏ cả bốn ý được 0 điểm');
assert.equal(score('Đ?ĐS').points.II,.5,'Phần II: ý được chấp nhận Đ/S nhưng bỏ trống không được tính');
assert.equal(score('Đ ĐS').points.II,.5,'Phần II: ô trống thay vì Đ/S không được tính');
assert.equal(serializeChoiceII(parseChoiceII('Đ*ĐS').columns),'Đ*ĐS','Phần II: lưu và mở lại giữ cả Đúng/Sai');

exam.keys['101'].II=['ALL'];
assert.equal(score('????').points.II,1);
console.log('PASS: part II Đ and Sai simultaneous accepts either, fixed partial credit and visual model');
