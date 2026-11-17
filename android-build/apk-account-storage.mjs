import {inspectSignedIdentity} from './offline-license.mjs';
import {apkAccountStorage} from './account-namespace.mjs';
// A verified signed, device-bound identity can select its local namespace
// offline even if plan entitlement has expired. It does not unlock grading.
const saved=localStorage.getItem('cp-v14-signed-license');
const identity=saved?await inspectSignedIdentity(saved):null;
export const accountStore=apkAccountStorage(identity?.sub);
