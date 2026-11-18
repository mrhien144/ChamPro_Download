import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync('android-build/account-direct.mjs','utf8');
const prep=readFileSync('android-build/prepare-preview-apk.py','utf8');
test('website is plain text, no checkout or upgrade link',()=>{
 const info=prep.slice(prep.indexOf('<div id="cpViewPlans"'),prep.indexOf('<p id="cpAuthStatus"'));
 assert.match(info,/<strong>champro\.mrhien\.com<\/strong>/);
 assert.doesNotMatch(info,/<a\b|href=|onclick=|cpBuy|QR ngân hàng/i);
 assert.match(info,/Cập nhật quyền sử dụng/);
});
test('account refresh cannot start network or apply license while camera is busy',async()=>{
 const body=src.slice(src.indexOf('async function refreshPlan('),src.indexOf('async function exchange('));
 let busy=true,calls=0,applied=0,deferred=0,resolveNetwork;
 const context=vm.createContext({navigator:{onLine:true},cameraBusy:()=>busy,deferPlanRefresh:()=>deferred++,refreshing:null,lastRefreshAt:0,LICENSE_KEY:'license',localStorage:{getItem:()=> 'old',setItem:()=>applied++},inspectSignedIdentity:async()=>({sub:'wp:8'}),deviceId:()=> 'dev',refreshSignedLicense:async()=>{calls++;return await new Promise(r=>{resolveNetwork=r;});},verifyLicense:async()=>({sub:'wp:8',deviceId:'dev',plan:'annual'}),stamp:()=>{},unlock:()=>{},planLabel:()=>'',describe:String});
 vm.runInContext(body,context);
 await context.refreshPlan(true);
 assert.equal(calls,0);assert.equal(deferred,1);
 busy=false;
 const pending=context.refreshPlan(true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(typeof resolveNetwork,'function');
 busy=true;resolveNetwork({license:'new'});
 await pending;assert.equal(applied,0);assert.equal(deferred,2);
 busy=false;
 const next=context.refreshPlan(true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);resolveNetwork({license:'new'});
 await next;assert.equal(applied,1);
});
test('resume and Internet reconnect trigger refresh, without recurring background polling',()=>{
 assert.match(src,/addEventListener\('online',refreshOnReturn\)/);
 assert.match(src,/addEventListener\('visibilitychange',refreshOnReturn\)/);
 assert.match(src,/addListener\('appStateChange'/);
 assert.doesNotMatch(src,/setInterval\(/);
});
