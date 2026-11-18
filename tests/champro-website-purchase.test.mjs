import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutUrl} from '../android-build/website-purchase.mjs';
test('website QR checkout uses the correct first-party plan route',()=>{
 assert.equal(checkoutUrl('annual'),'https://mrhien.com/champro-mua-goi/?plan=annual');
 assert.equal(checkoutUrl('lifetime'),'https://mrhien.com/champro-mua-goi/?plan=lifetime');
 assert.throws(()=>checkoutUrl('other'));
});
