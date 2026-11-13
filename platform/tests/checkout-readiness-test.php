<?php
/** Offline isolated readiness contract tests: no WordPress install/network required. */
error_reporting(E_ALL);
define('ABSPATH',__DIR__);
define('CHAMPRO_LIVE_CHECKOUT_ENABLED',true);
define('CHAMPRO_LIVE_GRANTS_ENABLED',true);
define('CHAMPRO_PAYMENT_E2E_VERIFIED',true);
define('CHAMPRO_ANNUAL_PRODUCT_ID',8919);
define('CHAMPRO_LIFETIME_PRODUCT_ID',8920);
$GLOBALS['hooks']=[];$GLOBALS['products']=[];$GLOBALS['readyBridge']=true;$GLOBALS['bridgeReply']=true;$GLOBALS['gatewayEnabled']='yes';$GLOBALS['currency']='VND';
function add_action($name,$cb,$prio=10,$args=1){$GLOBALS['hooks'][$name][]=$cb;}
function add_filter($name,$cb,$prio=10,$args=1){$GLOBALS['hooks'][$name][]=$cb;}
function add_shortcode($name,$cb){}
function champro_bridge_ready(){return $GLOBALS['readyBridge'];}
function champro_bridge_request($payload){return $GLOBALS['bridgeReply']?['ok'=>true,'ready'=>true]:new WP_Error('preflight','unavailable');}
function is_wp_error($x){return $x instanceof WP_Error;}
class WP_Error{function __construct($a='',$b=''){}}
class Product{
 public $price,$status='publish';
 function __construct($price){$this->price=$price;}
 function get_status(){return $this->status;}
 function is_virtual(){return true;}
 function is_type($t){return $t==='simple';}
 function is_purchasable(){return true;}
 function get_price(){return $this->price;}
}
function wc_get_product($id){return $GLOBALS['products'][$id]??null;}
function get_woocommerce_currency(){return $GLOBALS['currency'];}
function is_user_logged_in(){return true;}
class Gateways{function get_available_payment_gateways(){return ['sepay'=>(object)['enabled'=>$GLOBALS['gatewayEnabled']]];}}
class Woo{function payment_gateways(){return new Gateways();}}
function WC(){return new Woo();}
function check($value,$label){if(!$value){fwrite(STDERR,"FAIL: $label\n");exit(1);} echo "PASS: $label\n";}
require __DIR__.'/../wordpress/champro-checkout-gate.php';
$GLOBALS['products']=[8919=>new Product(99000),8920=>new Product(299000)];
check(champro_checkout_is_enabled(),'Required server flags are true in isolated positive test');
check(champro_checkout_system_ready(),'Healthy two-product/SePay/Worker preflight allowed');
$GLOBALS['bridgeReply']=false;check(!champro_checkout_system_ready(),'Worker cannot verify DB or IDs => deny');
$GLOBALS['bridgeReply']=true;$GLOBALS['readyBridge']=false;check(!champro_checkout_system_ready(),'Bridge unconfigured => deny');
$GLOBALS['readyBridge']=true;$GLOBALS['gatewayEnabled']='no';check(!champro_checkout_system_ready(),'SePay disabled => deny');
$GLOBALS['gatewayEnabled']='yes';$GLOBALS['products'][8920]->price=1000;check(!champro_checkout_system_ready(),'Wrong lifetime price => deny');
$GLOBALS['products'][8920]->price=299000;$GLOBALS['products'][8919]->status='draft';check(!champro_checkout_system_ready(),'Unpublished annual product => deny');
$GLOBALS['products'][8919]->status='publish';$GLOBALS['currency']='USD';check(!champro_checkout_system_ready(),'Wrong currency => deny');
$GLOBALS['currency']='VND';check(champro_checkout_system_ready(),'Restored all prerequisites => ready');
echo "PASS: checkout readiness gate test complete.\n";
