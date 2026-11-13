<?php
/** Checkout Gate fail-closed tests, no real WordPress/WooCommerce/network. */
error_reporting(E_ALL);
define('ABSPATH', __DIR__);
$GLOBALS['hooks']=[]; $GLOBALS['shortcodes']=[]; $GLOBALS['logged_in']=true;
$GLOBALS['currency']='VND'; $GLOBALS['products']=[]; $GLOBALS['notices']=[];
function add_filter($name,$callback,$priority=10,$args=1){$GLOBALS['hooks'][$name][]=$callback;}
function add_action($name,$callback,$priority=10,$args=1){$GLOBALS['hooks'][$name][]=$callback;}
function add_shortcode($name,$cb){$GLOBALS['shortcodes'][$name]=$cb;}
function is_user_logged_in(){return $GLOBALS['logged_in'];}
function get_woocommerce_currency(){return $GLOBALS['currency'];}
function wc_get_product($id){return $GLOBALS['products'][$id]??null;}
function wc_add_notice($msg,$type='error'){$GLOBALS['notices'][]=$msg;}
class WP_Error{
 private $message;
 function __construct($code,$message){$this->message=$message;}
 function get_error_message(){return $this->message;}
}
function is_wp_error($x){return $x instanceof WP_Error;}
class P{
 private $id,$price,$published,$virtual;
 function __construct($id,$price,$published=true,$virtual=true){$this->id=$id;$this->price=$price;$this->published=$published;$this->virtual=$virtual;}
 function get_status(){return $this->published?'publish':'draft';}
 function is_virtual(){return $this->virtual;}
 function is_type($type){return $type==='simple';}
 function is_purchasable(){return true;}
 function get_price(){return $this->price;}
}
class Cart{
 public $items=[],$total=0;
 function get_cart(){return $this->items;}
 function get_total($context='view'){return $this->total;}
 function is_empty(){return !$this->items;}
}
class Gateway{
 function get_available_payment_gateways(){return ['sepay'=>(object)['enabled'=>'yes'], 'wallet'=>(object)['enabled'=>'yes']];}
}
class WCMock{
 public $cart;
 function __construct(){$this->cart=new Cart();}
 function payment_gateways(){return new Gateway();}
}
$GLOBALS['woocommerce']=new WCMock();
function WC(){return $GLOBALS['woocommerce'];}
function assert_true($condition,$message){if(!$condition){fwrite(STDERR,"FAIL: $message\n");exit(1);}echo "PASS: $message\n";}
require __DIR__.'/../wordpress/champro-checkout-gate.php';
$GLOBALS['products']=[
 8919=>new P(8919,99000),
 8920=>new P(8920,299000)
];
$cart=WC()->cart;
function make_cart($id,$qty,$total){$GLOBALS['woocommerce']->cart->items=[['product_id'=>$id,'quantity'=>$qty]];$GLOBALS['woocommerce']->cart->total=$total;}
assert_true(champro_checkout_is_enabled()===false,'Preflight checkout closed by default');
assert_true(is_wp_error(champro_checkout_validate_plan('annual')),'Checkout plan blocked while closed');
make_cart(8919,1,99000);
assert_true(champro_checkout_cart_issue()!=='','ChấmPro cart checkout blocked while closed');
$GLOBALS['woocommerce']->cart->items=[];
assert_true(champro_checkout_cart_issue()==='','Other store orders unchanged');
assert_true(count($GLOBALS['hooks']['woocommerce_available_payment_gateways'])===1,'Gateway filter installed');
$f=$GLOBALS['hooks']['woocommerce_available_payment_gateways'][0];
$all=['sepay'=>(object)[], 'wallet'=>(object)[]];
assert_true(count($f($all))===2,'Ordinary store retains its gateways');
make_cart(8919,1,99000);
assert_true(array_keys($f($all))===['sepay'],'ChấmPro cart only offers SePay');
echo "PASS: main checkout entry remains safely disabled and other products unaffected.\n";
