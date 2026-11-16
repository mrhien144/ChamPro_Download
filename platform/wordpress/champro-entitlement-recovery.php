<?php
/**
 * Plugin Name: ChấmPro Entitlement Recovery (QA)
 * Description: Verify paid WooCommerce orders (processing/completed) before reconciling Direct Login device-license metadata. Does not alter scoring or login keys.
 * Version: 0.1.1
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;

/**
 * Reconcile only a named user that is already being issued a Direct Login
 * license; never accept a client-supplied plan. Payment and owner evidence
 * must come from WooCommerce on this same WordPress installation.
 *
 * This is an optional companion to deployed Direct Login 0.5.2, whose
 * cpd_license() reads cpd_verified_plan / cpd_verified_expires.
 * It does not change Cloudflare D1; verify web entitlements separately.
 */
function cper_verified_order_entitlement($user_id) {
    if (!function_exists('wc_get_orders') ||
        !defined('CHAMPRO_ANNUAL_PRODUCT_ID') ||
        !defined('CHAMPRO_LIFETIME_PRODUCT_ID')) return null;
    $annual=(int) CHAMPRO_ANNUAL_PRODUCT_ID;
    $lifetime=(int) CHAMPRO_LIFETIME_PRODUCT_ID;
    if (!$annual || !$lifetime || $annual===$lifetime) return null;
    $orders=wc_get_orders(array(
        'customer_id'=>$user_id, 'status'=>array('processing','completed'),
        'orderby'=>'date', 'order'=>'ASC', 'limit'=>100
    ));
    if (!is_array($orders)) return null;
    $matches=array();
    foreach ($orders as $order) {
        if (!$order || (int) $order->get_user_id() !== $user_id ||
            !in_array($order->get_status(),array('processing','completed'),true) ||
            !$order->is_paid() || !$order->get_date_paid() ||
            $order->get_currency() !== 'VND') continue;
        $items=$order->get_items('line_item');
        if (count($items)!==1) continue; // no ambiguous carts/bundles
        $item=reset($items);
        if (!$item || (int) $item->get_quantity()!==1) continue;
        $product=(int) $item->get_product_id();
        if ($product!==$annual && $product!==$lifetime) continue;
        $expected=$product===$annual?99000:299000;
        // SePay may keep fully paid orders in Processing. Require the exact
        // paid amount; a Processing order alone is NOT payment evidence.
        if (abs((float)$order->get_total()-$expected)>0.001) continue;
        $matches[]=array(
            'id'=>(int)$order->get_id(),
            'plan'=>$product===$lifetime?'lifetime':'annual',
            'paid'=>(int)$order->get_date_paid()->getTimestamp()
        );
    }
    if (!$matches) return null;
    usort($matches,function($a,$b){
        if ($a['paid']===$b['paid']) return $a['id'] <=> $b['id'];
        return $a['paid'] <=> $b['paid'];
    });
    $expires=0;
    foreach ($matches as $row) {
        if ($row['plan']==='lifetime')
            return array('plan'=>'lifetime','expires'=>0,'evidence'=>$row['id']);
        // A renewal adds a calendar year to the later of payment date and
        // previous paid entitlement expiry, without resetting existing rights.
        $from=max($expires,$row['paid']);
        $expires=(new DateTimeImmutable('@'.$from))->modify('+1 year')->getTimestamp();
    }
    return array('plan'=>'annual','expires'=>$expires,'evidence'=>end($matches)['id']);
}

function cper_reconcile_user($user_id) {
    static $running=false;
    if ($running || !$user_id || !function_exists('get_user_meta') || !function_exists('update_user_meta')) return false;
    $running=true;
    try {
        // Prevent order scans on every app reconnect. Never cache an asserted
        // client plan; cache only when this trusted server-side check ran.
        $cache_key='cper_checked_'.(int)$user_id;
        if (function_exists('get_transient') && get_transient($cache_key)) return false;
        $verified=cper_verified_order_entitlement((int)$user_id);
        if ($verified) {
            $existing=(string)get_user_meta($user_id,'cpd_verified_plan',true);
            $old_exp=(int)get_user_meta($user_id,'cpd_verified_expires',true);
            if ($existing!=='lifetime') {
                if ($verified['plan']==='lifetime') {
                    update_user_meta($user_id,'cpd_verified_expires',0);
                    update_user_meta($user_id,'cpd_verified_plan','lifetime');
                } elseif ($verified['expires']>time() && $verified['expires']>$old_exp) {
                    update_user_meta($user_id,'cpd_verified_expires',$verified['expires']);
                    update_user_meta($user_id,'cpd_verified_plan','annual');
                }
            }
        }
        if (function_exists('set_transient')) set_transient($cache_key,1,600);
        return (bool)$verified;
    } finally {
        $running=false;
    }
}

// The legacy Direct Login plugin uses get_user_meta($uid,'cpd_verified_plan')
// during PKCE exchange and authenticated device refresh. Reconcile before
// that read; no unauthenticated API endpoint is created.
add_filter('get_user_metadata',function($pre,$user_id,$key,$single){
    if ($pre!==null || $key!=='cpd_verified_plan') return $pre;
    cper_reconcile_user((int)$user_id);
    return $pre;
},10,4);

// WooCommerce receipt event: update an already existing subscriber promptly;
// no client side claim of payment can trigger this hook.
foreach (array('woocommerce_order_status_processing','woocommerce_order_status_completed') as $hook) add_action($hook,function($order_id){
    if (!function_exists('wc_get_order')) return;
    $order=wc_get_order($order_id);
    if (!$order || !$order->is_paid() || !(int)$order->get_user_id()) return;
    $id=(int)$order->get_user_id();
    if (function_exists('delete_transient')) delete_transient('cper_checked_'.$id);
    cper_reconcile_user($id);
},30,1);
