import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAuthReturn} from '../android-build/auth-return.mjs';
const state='a'.repeat(32), ticket='b'.repeat(48);
test('accept only exact WordPress one-time ticket and state callback',()=>{
 assert.deepEqual(parseAuthReturn('champrotest://auth/complete?ticket='+ticket+'&state='+state,state),{ticket,state});
});
test('reject forged host, state, duplicate keys and injected credentials',()=>{
 for(const url of [
  'https://auth/complete?ticket='+ticket+'&state='+state,
  'champrotest://evil/complete?ticket='+ticket+'&state='+state,
  'champrotest://auth/wrong?ticket='+ticket+'&state='+state,
  'champrotest://auth/complete?ticket='+ticket+'&state='+'c'.repeat(32),
  'champrotest://auth/complete?ticket='+ticket+'&state='+state+'&token=evil',
  'champrotest://auth/complete?ticket='+ticket+'&state='+state+'#secret',
  'champrotest://user@auth/complete?ticket='+ticket+'&state='+state,
  'champrotest://auth/complete?ticket='+ticket+'&ticket='+ticket+'&state='+state,
  'champrotest://auth/complete?ticket=invalid&state='+state,
  'invalid'
 ])assert.equal(parseAuthReturn(url,state),null,url);
});
