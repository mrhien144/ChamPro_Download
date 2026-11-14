<?php
/** Isolated WP pilot checkout contract: no network, payments or DB writes. */
error_reporting(E_ALL);
define('ABSPATH', __DIR__);
define('CHAMPRO_LIVE_CHECKOUT_ENABLED', false);
define('CHAMPRO_LIVE_GRANTS_ENABLED', true);
define('CHAMPRO_PAYMENT_E2E_VERIFIED', false);
define('CHAMPRO_PILOT_CHECKOUT_ENABLED', true);
define('CHAMPRO_PILOT_WP_USER_ID', 8);
define('CHAMPRO_ANNUAL_PRODUCT_ID', 8919);
define('CHAMPRO_LIFETIME_PRODUCT_ID', 8920);
$GLOBALS['fake_uid']=8;
$GLOBALS['hooks']=[];
$GLOBALS['products']=[];
$GLOBALS['bridgeReady']=true;
function add_action($n,$cb,$p=10,$a=1){$GLOBALS['hooks'][$n][]=$cb;}
function add_filter($n,$cb,$p=10,$a=1){$GLOBALS['hooks'][$n][]=$cb;}
function add_shortcode($n,$cb){}
function is_user_logged_in(){return $GLOBALS['fake_uid']>0;}
function get_current_user_id(){return $GLOBALS['fake_uid'];}
function is_wp_error($x){return $x instanceof WP_Error;}
class WP_Error{function __construct($c='',$m='', $d=null){}}
class Prod{
 public $price;function __construct($p){$this->price=$p;}
 function get_id(){return $this->price===99000?8919:8920;}
 function get_status(){return 'publish';}
 function is_virtual(){return true;}
 function is_type($t){return $t==='simple';}
 function is_purchasable(){return champro_checkout_access_allowed();}
 function get_price(){return $this->price;}
}
function wc_get_product($id){return $GLOBALS['products'][$id]??null;}
function get_woocommerce_currency(){return 'VND';}
class GW{function get_available_payment_gateways(){return ['sepay'=>(object)['enabled'=>'yes']];}}
class Woo{public $cart=null;function payment_gateways(){return new GW();}}
function WC(){return new Woo();}
function champro_bridge_ready(){return $GLOBALS['bridgeReady'];}
function champro_bridge_request($payload){return ['ok'=>true,'ready'=>true];}
function check($v,$name){if(!$v){fwrite(STDERR,"FAIL $name\n");exit(1);}echo "PASS $name\n";}
$GLOBALS['products']=[8919=>new Prod(99000),8920=>new Prod(299000)];
require __DIR__.'/../wordpress/champro-checkout-gate.php';
check(!champro_checkout_is_enabled(),'public checkout remains disabled');
check(champro_pilot_user_allowed(),'only pilot user explicitly enabled');
check(champro_checkout_system_ready(),'pilot account can pass server-side preflight');
check(!champro_checkout_system_ready(true),'public readiness remains false for everyone');
$GLOBALS['fake_uid']=9;
check(!champro_pilot_user_allowed(),'other WP user denied');
check(!champro_checkout_system_ready(),'other user denied even with valid products');
$GLOBALS['fake_uid']=0;
check(!champro_pilot_user_allowed(),'guest denied');
$GLOBALS['fake_uid']=8;
$GLOBALS['bridgeReady']=false;
check(!champro_checkout_system_ready(),'pilot fails closed when Bridge unavailable');
echo "PASS ChấmPro pilot-gate checks.\n";
