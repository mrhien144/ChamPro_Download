<?php
/* Isolated ChấmPro WooCommerce payment contract tests. No real database/network. */
error_reporting(E_ALL);
define('ABSPATH', __DIR__);
define('CHAMPRO_WORKER_URL', 'https://example.invalid');
define('CHAMPRO_AUTH_SECRET', 'test-only-secret');
define('CHAMPRO_BRIDGE_SECRET', 'test-only-secret');
define('CHAMPRO_ANNUAL_PRODUCT_ID', 8919);
define('CHAMPRO_LIFETIME_PRODUCT_ID', 8920);
define('CHAMPRO_ALLOWED_GATEWAY_IDS', 'sepay');
// Enable only inside isolated fake WooCommerce contract tests.
define('CHAMPRO_LIVE_GRANTS_ENABLED', true);
$GLOBALS['hooks'] = [];
$GLOBALS['requests'] = [];
function add_action($name, $callback, $priority=10, $argc=1) { $GLOBALS['hooks'][$name][] = $callback; }
function add_filter($name, $callback, $priority=10, $argc=1) {}
function add_shortcode($name, $callback) {}
function is_wp_error($v) { return $v instanceof WP_Error; }
class WP_Error { public function __construct($x='err',$m='error') {} }
function get_user_by($field,$id) { return (object)['ID'=>$id,'user_email'=>'test@example.invalid','display_name'=>'Test']; }
function wp_json_encode($v) { return json_encode($v); }
function wp_remote_post($url,$args) {
    $payload=json_decode($args['body'], true);
    $GLOBALS['requests'][]=$payload;
    return ['status'=>200,'body'=>json_encode(['ok'=>true])];
}
function wp_remote_retrieve_response_code($r) { return $r['status']; }
function wp_remote_retrieve_body($r) { return $r['body']; }
class FakeItem {
    private $id,$qty;
    function __construct($id,$qty=1){ $this->id=$id;$this->qty=$qty; }
    function get_product_id(){return $this->id;}
    function get_quantity(){return $this->qty;}
}
class FakeOrder {
    public $status='processing',$paid=true,$date=true,$method='sepay',$total=99000,$currency='VND',
        $user=42,$items=[],$notes=[];
    function __construct(){ $this->items=[new FakeItem(8919)]; }
    function get_user_id(){return $this->user;}
    function is_paid(){return $this->paid;}
    function get_date_paid(){return $this->date;}
    function get_status(){return $this->status;}
    function get_payment_method(){return $this->method;}
    function get_currency(){return $this->currency;}
    function get_total(){return $this->total;}
    function get_items(){return $this->items;}
    function add_order_note($v){$this->notes[]=$v;}
}
$GLOBALS['orders'] = [];
function wc_get_order($id) {return $GLOBALS['orders'][$id]??false;}
require __DIR__.'/../wordpress/champro-bridge.php';
function check($ok,$label) {
 if(!$ok){fwrite(STDERR,"FAIL: ".$label."\n");exit(1);}
 echo "PASS: ".$label."\n";
}
check(isset($GLOBALS['hooks']['woocommerce_order_status_changed']),'SePay status change hook registered');
check(!isset($GLOBALS['hooks']['woocommerce_payment_complete']),'Do not depend on payment_complete for SePay 1.1.23');
function sepay_api($order_id,$new_status='processing') {
    $order=$GLOBALS['orders'][$order_id];
    champro_bridge_sepay_status_changed($order_id,'on-hold',$new_status,$order);
}
function run_case($label, $mutate, $shouldGrant, $plan='annual', $fromSepay=true) {
    $GLOBALS['requests']=[];
    $o=new FakeOrder();
    $mutate($o);
    $GLOBALS['orders'][9876]=$o;
    if ($fromSepay) sepay_api(9876,$o->status);
    else champro_bridge_sepay_status_changed(9876,'on-hold',$o->status,$o);
    $grant=array_values(array_filter($GLOBALS['requests'],fn($p)=>$p['action']==='paid-order'));
    check(($shouldGrant && count($grant)===1 && $grant[0]['plan']===$plan && $grant[0]['orderStatus']==='paid') ||
       (!$shouldGrant && count($grant)===0), $label);
}
run_case('SePay callback accepts 99k annual / Processing',fn($o)=>null,true);
run_case('Manual Processing with all paid flags is rejected',fn($o)=>null,false,'annual',false);
run_case('SePay callback with Woo unpaid flag is rejected',fn($o)=>$o->paid=false,false);
run_case('SePay callback with on-hold is rejected',fn($o)=>$o->status='on-hold',false);
run_case('Other gateway rejected',fn($o)=>$o->method='bacs',false);
run_case('Wrong price rejected',fn($o)=>$o->total=1000,false);
run_case('Wrong currency rejected',fn($o)=>$o->currency='USD',false);
run_case('Guest buyer rejected',fn($o)=>$o->user=0,false);
run_case('Mixed cart rejected',fn($o)=>$o->items=[new FakeItem(8919),new FakeItem(8920)],false);
run_case('Quantity 2 rejected',fn($o)=>$o->items=[new FakeItem(8919,2)],false);
run_case('Wrong product rejected',fn($o)=>$o->items=[new FakeItem(9999)],false);
run_case('SePay callback accepts 299k lifetime / Completed',function($o){$o->status='completed';$o->total=299000;$o->items=[new FakeItem(8920)];},true,'lifetime');
echo "SePay 1.1.23 webhook contract checks passed.\\n";
