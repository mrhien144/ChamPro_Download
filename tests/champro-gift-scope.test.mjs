import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const source=readFileSync('platform/wordpress/champro-direct-login.php','utf8');
const baseline=execFileSync('git',['show','16406decde529a8f3ca778cc82225bfcd400f857:platform/wordpress/champro-direct-login.php'],{encoding:'utf8'});
const headerless=s=>s.replace(/ \* (?:Version|Description):[^\n]+/g,'');
test('live 0.5.2 signing, device authentication, key storage and REST routes are unchanged',()=>{
 assert.equal(headerless(source.split('/** Read admin-granted plans')[0]),headerless(baseline.split('function cpd_license(')[0]));
 assert.equal(source.slice(source.indexOf('register_activation_hook')),baseline.slice(baseline.indexOf('register_activation_hook')));
});
test('server repair leaves Android, grading, camera, payment Worker and sync sources byte-identical',()=>{
 const files=execFileSync('git',['diff','--name-only','67d970aaf4154b960cf044a29b6e24bc70574b0d','--','android-build','app-preview','platform/worker','platform/sync','platform/sync-worker'],{encoding:'utf8'}).trim();
 assert.equal(files,'');
});
