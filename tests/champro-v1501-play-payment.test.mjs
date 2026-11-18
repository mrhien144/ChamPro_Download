import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const account=readFileSync('android-build/account-direct.mjs','utf8');
const prep=readFileSync('android-build/prepare-preview-apk.py','utf8');
test('Play account UI cannot open legacy QR checkout or sideload update',()=>{
 assert.doesNotMatch(account,/champro-connect-app|champro-mua-goi|PENDING_PAYMENT|cpBuyAnnual|cpBuyLifetime|function buy\(/);
 assert.doesNotMatch(prep,/id="cpBuyAnnual"|id="cpBuyLifetime"|src="\.\/update-app\.mjs"|id="cpUpdateDownload"/);
 assert.match(prep,/Thông tin nâng cấp/);
 assert.match(prep,/<strong>champro\.mrhien\.com<\/strong>/);
 assert.doesNotMatch(prep,/<a[^>]+href=[^>]*champro\.mrhien\.com[^>]*>[^<]*(?:mua|nâng cấp)/i);
});
test('existing plan refresh and login remain wired',()=>{
 assert.match(account,/\$\('cpRefreshPlan'\).onclick=\(\)=>void refreshPlan\(true\)/);
 assert.match(account,/await refreshSignedLicense\(deviceId\(\),uid\)/);
 assert.match(account,/await verifyLicense\(fresh.license\)/);
 assert.match(account,/champro-login-app/);
});
