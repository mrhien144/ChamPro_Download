/**
 * ChấmPro diagnostic correction for the actual printed 3-part, 3-digit sheet.
 * Calibrated against the 4 outer marks and printed bubble centres; no user
 * records, answer keys or existing layout files are ever modified.
 * NOT authorized for unattended grading until independently verified.
 */
export function printedThreePartLayout(original){
 if(!original||original.exam_code?.length!==3||original.parts?.I?.length!==40||original.parts?.II?.length!==8||original.parts?.III?.length!==6)return null;
 const data=JSON.parse(JSON.stringify(original));
 // Measurements in the original PDF coordinate system (points). The real
 // printed grid has different origin/spacing than layouts.json.
 const settings={
  sbd:{dx:17.52,dy:5.03,sx:.83,sy:.95},
  code:{dx:18.55,dy:6.23,sx:.66,sy:.94},
  I:{dx:15.16,dy:15.04,sx:.93,sy:.82},
  II:{dx:16.39,dy:-9.41,sx:.98,sy:.84},
  III:{dx:16.06,dy:-7.31,sx:.94,sy:1.00}
 };
 function transform(point,baseX,baseY,options){
  return [baseX+options.dx+(point[0]-baseX)*options.sx,baseY+options.dy+(point[1]-baseY)*options.sy];
 }
 function identity(field,opt){
  const group=data[field],source=original[field],x0=source[0][0][0],y0=source[0][0][1];
  for(let i=0;i<group.length;i++)for(let j=0;j<group[i].length;j++)
   group[i][j]=transform(source[i][j],x0,y0,opt);
 }
 identity('candidate_no',settings.sbd);
 identity('exam_code',settings.code);
 const firstY=original.parts.I[0][0][1];
 for(let i=0;i<40;i++){
  const baseX=original.parts.I[i][0][0];
  for(let j=0;j<original.parts.I[i].length;j++){
   data.parts.I[i][j]=transform(original.parts.I[i][j],baseX,firstY,settings.I);
  }
 }
 const secondY=original.parts.II[0][0][0][1];
 for(let i=0;i<8;i++){
  const baseX=original.parts.II[i][0][0][0];
  for(let j=0;j<original.parts.II[i].length;j++)
   for(let k=0;k<original.parts.II[i][j].length;k++)
    data.parts.II[i][j][k]=transform(original.parts.II[i][j][k],baseX,secondY,settings.II);
 }
 const thirdY=original.parts.III[0][0][0][1];
 for(let i=0;i<6;i++){
  const baseX=original.parts.III[i][0][0][0];
  for(let j=0;j<original.parts.III[i].length;j++)
   for(let k=0;k<original.parts.III[i][j].length;k++)
    data.parts.III[i][j][k]=transform(original.parts.III[i][j][k],baseX,thirdY,settings.III);
 }
 return data;
}
