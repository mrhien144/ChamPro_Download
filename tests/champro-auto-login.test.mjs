import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedAuthPair} from '../android-build/auth-return.mjs';
const valid='ABCDEFGH2';
test('accept only app callback containing exact 9 character one-use code',()=>{
 assert.equal(acceptedAuthPair('champrotest://auth/complete?pair='+valid,valid),true);
});
test('reject unknown protocol, forged host, path, extra credentials, queries and reused code',()=>{
 for(const url of [
  'https://auth/complete?pair='+valid,
  'champrotest://evil/complete?pair='+valid,
  'champrotest://auth/wrong?pair='+valid,
  'champrotest://auth/complete?pair=ABCDEFGH3',
  'champrotest://auth/complete?pair='+valid+'&token=fake',
  'champrotest://auth/complete?pair='+valid+'#secret',
  'champrotest://user@auth/complete?pair='+valid,
  'champrotest://auth/complete?pair='+valid+'&pair='+valid,
  'garbage'
 ]) assert.equal(acceptedAuthPair(url,valid),false,url);
});
test('never accept invalid expected code',()=>{
 assert.equal(acceptedAuthPair('champrotest://auth/complete?pair='+valid,'INVALID'),false);
});
