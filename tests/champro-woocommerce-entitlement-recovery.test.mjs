import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const common=[
"define('ABSPATH','/test/');",
"define('CHAMPRO_ANNUAL_PRODUCT_ID',8919);",
"define('CHAMPRO_LIFETIME_PRODUCT_ID',8920);",
"function add_filter(){ } function add_action(){ }",
"$GLOBALS['meta']=[]; $GLOBALS['orders']=[]; $GLOBALS['transients']=[];",
"function get_user_meta($id,$key,$single){ return $GLOBALS['meta'][$id][$key]??''; }",
"function update_user_meta($id,$key,$v){$GLOBALS['meta'][$id][$key]=$v;return true;}",
"function get_transient($key){return $GLOBALS['transients'][$key]??false;}",
"function set_transient($key,$v,$seconds){$GLOBALS['transients'][$key]=$v;return true;}",
"function delete_transient($key){unset($GLOBALS['transients'][$key]);}",
"function wc_get_orders($query){return $GLOBALS['orders'];}",
"class PaidDate{function __construct($t){$this->t=$t;}private $t;function getTimestamp(){return $this->t;}}",
"class Item{function __construct($p,$q=1){$this->p=$p;$this->q=$q;}private $p,$q;function get_product_id(){return $this->p;}function get_quantity(){return $this->q;}}",
"class Order{function __construct($id,$user,$paid,$product,$status='completed',$currency='VND',$total=99000){$this->id=$id;$this->user=$user;$this->paid=$paid;$this->product=$product;$this->status=$status;$this->currency=$currency;$this->total=$total;}private $id,$user,$paid,$product,$status,$currency,$total;function get_user_id(){return $this->user;}function get_status(){return $this->status;}function is_paid(){return $this->paid>0;}function get_date_paid(){return $this->paid?new PaidDate($this->paid):false;}function get_currency(){return $this->currency;}function get_total(){return $this->total;}function get_items($kind){return [new Item($this->product)];}function get_id(){return $this->id;}}",
"require 'platform/wordpress/champro-entitlement-recovery.php';"
].join('\n');
function run(src){
 const p=spawnSync('php',['-r',common+'\n'+src],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr||p.stdout);
 return JSON.parse(p.stdout);
}
test('a paid annual order grants annual entitlement without device reinstall',()=>{
 const x=run("$GLOBALS['orders']=[new Order(301,42,time()-86400,8919)]; cper_reconcile_user(42);echo json_encode($GLOBALS['meta'][42]);");
 assert.equal(x.cpd_verified_plan,'annual');
 assert.ok(Number(x.cpd_verified_expires)>Math.floor(Date.now()/1000));
});
test('no paid completed order, no grant; another WordPress user cannot claim payment',()=>{
 const x=run("$GLOBALS['orders']=[new Order(302,18,1760000000,8919),new Order(303,42,0,8919),new Order(304,42,1760000000,8919,'cancelled')]; cper_reconcile_user(42);echo json_encode($GLOBALS['meta']);");
 assert.deepEqual(x,[]);
});
test('lifetime is preserved and annual cannot downgrade it',()=>{
 const x=run("$GLOBALS['meta'][42]=['cpd_verified_plan'=>'lifetime','cpd_verified_expires'=>0];$GLOBALS['orders']=[new Order(305,42,1760000000,8919)]; cper_reconcile_user(42);echo json_encode($GLOBALS['meta'][42]);");
 assert.equal(x.cpd_verified_plan,'lifetime');
});
test('a verified lifetime order upgrades annual',()=>{
 const x=run("$GLOBALS['meta'][42]=['cpd_verified_plan'=>'annual','cpd_verified_expires'=>1760000001];$GLOBALS['orders']=[new Order(306,42,1760000000,8920,'completed','VND',299000)];cper_reconcile_user(42);echo json_encode($GLOBALS['meta'][42]);");
 assert.equal(x.cpd_verified_plan,'lifetime');
});
test('an underpaid lifetime order cannot upgrade an annual purchase',()=>{
 const x=run("$GLOBALS['meta'][42]=['cpd_verified_plan'=>'annual','cpd_verified_expires'=>1760000001];$GLOBALS['orders']=[new Order(306,42,1760000000,8920,'completed','VND',99000)];cper_reconcile_user(42);echo json_encode($GLOBALS['meta'][42]);");
 assert.equal(x.cpd_verified_plan,'annual');assert.equal(x.cpd_verified_expires,1760000001);
});
test('two annual paid orders extend, not shorten, entitlements',()=>{
 const x=run("$GLOBALS['orders']=[new Order(307,42,1700000000,8919),new Order(308,42,1730000000,8919)];$p=cper_verified_order_entitlement(42);echo json_encode($p);");
 assert.equal(x.plan,'annual');assert.ok(x.expires>1760000000);
});


test('SePay processing order 8943 with verified paid timestamp activates annual',()=>{
 const x=run("$GLOBALS['orders']=[new Order(8943,42,1763100000,8919,'processing','VND',99000)];$p=cper_verified_order_entitlement(42);echo json_encode($p);");
 assert.equal(x.plan,'annual'); assert.equal(x.evidence,8943);
 assert.ok(x.expires>1763100000);
});
test('processing without a paid timestamp cannot activate a plan',()=>{
 const x=run("$GLOBALS['orders']=[new Order(8943,42,0,8919,'processing','VND',99000)];echo json_encode(cper_verified_order_entitlement(42));");
 assert.equal(x,null);
});
test('processing order with incorrect amount cannot activate a plan',()=>{
 const x=run("$GLOBALS['orders']=[new Order(8943,42,1763100000,8919,'processing','VND',98000)];echo json_encode(cper_verified_order_entitlement(42));");
 assert.equal(x,null);
});
test('processing order belonging to different user cannot activate a plan',()=>{
 const x=run("$GLOBALS['orders']=[new Order(8943,41,1763100000,8919,'processing','VND',99000)];echo json_encode(cper_verified_order_entitlement(42));");
 assert.equal(x,null);
});
test('pending order does not activate even if it carries an old paid timestamp',()=>{
 const x=run("$GLOBALS['orders']=[new Order(8943,42,1763100000,8919,'pending','VND',99000)];echo json_encode(cper_verified_order_entitlement(42));");
 assert.equal(x,null);
});
