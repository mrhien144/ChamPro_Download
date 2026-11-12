<?php
/**
 * Plugin Name: ChấmPro App Login & Checkout (Staging)
 * Description: One-time pairing with ChấmPro APK and WooCommerce/SePay checkout; no client-side entitlement granting.
 * Version: 0.2.0
 * Requires Plugins: woocommerce
 */
defined('ABSPATH') || exit;

/** Requires the existing isolated ChấmPro Bridge plugin; no secrets in this source. */
function cpapp_ready() {
    return function_exists('champro_bridge_request') &&
           function_exists('champro_bridge_account') &&
           function_exists('champro_bridge_ready') &&
           champro_bridge_ready();
}
function cpapp_shop_ready() {
    return cpapp_ready() && function_exists('wc_create_order') &&
           defined('CHAMPRO_ANNUAL_PRODUCT_ID') &&
           defined('CHAMPRO_LIFETIME_PRODUCT_ID');
}
function cpapp_plan_product($plan) {
    if ($plan === 'annual') return (int) CHAMPRO_ANNUAL_PRODUCT_ID;
    if ($plan === 'lifetime') return (int) CHAMPRO_LIFETIME_PRODUCT_ID;
    return 0;
}
function cpapp_safe_checkout_url() {
    return home_url('/champro-connect-app/');
}
function cpapp_pair_code_from_request() {
    $v = isset($_GET['cp_pair']) ? strtoupper(sanitize_text_field(wp_unslash($_GET['cp_pair']))) : '';
    return preg_match('/^[A-HJ-NP-Z2-9]{9}$/', $v) ? $v : '';
}
function cpapp_auth_return_page($code) {
    $target = 'champrotest://auth/complete?pair=' . rawurlencode($code);
    nocache_headers();
    header('Content-Type: text/html; charset=utf-8');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow', true);
    echo '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quay lại ChấmPro</title></head>';
    echo '<body style="font:16px system-ui;margin:24px;max-width:560px">';
    echo '<h2>Đã đăng nhập và liên kết tài khoản ChấmPro</h2>';
    echo '<p>Đang mở lại ứng dụng để nhận quyền sử dụng…</p>';
    echo '<a id="cpapp-return" style="display:inline-block;padding:14px 20px;background:#1763c8;color:white;border-radius:9px;text-decoration:none" href="' . esc_url($target, array('champrotest')) . '">Quay lại ChấmPro</a>';
    echo '<p>Nếu trình duyệt yêu cầu xác nhận mở ứng dụng, hãy chọn Cho phép.</p>';
    echo '<script>location.replace(' . wp_json_encode($target) . ');</script>';
    echo '</body></html>';
    exit;
}
add_shortcode('champro_app_connect', function () {
    $pair = cpapp_pair_code_from_request();
    if (!is_user_logged_in()) {
        $destination = $pair ? add_query_arg('cp_pair',rawurlencode($pair),cpapp_safe_checkout_url()) : cpapp_safe_checkout_url();
        return '<section><h2>Đăng nhập để sử dụng ChấmPro</h2><p>Sau khi đăng nhập, hệ thống tự chuyển về ứng dụng. Không cần nhập mã thủ công.</p>' .
          '<a href="' . esc_url(wp_login_url($destination)) . '">Đăng nhập hoặc đăng ký</a></section>' .
          ($pair ? '<script>location.replace(' . wp_json_encode(wp_login_url($destination)) . ');</script>' : '');
    }
    if (!cpapp_ready()) return '<p>Cầu nối tài khoản ChấmPro chưa được cấu hình. Chưa thể kích hoạt.</p>';
    if ($pair) {
        // The authenticated visitor explicitly initiated a pairing in the APK.
        // Nonce-protected POST performs all sensitive changes; no side-effects on GET.
        ob_start(); ?>
        <div style="max-width:480px;margin:30px auto;padding:20px;font:16px system-ui">
          <h2>Đang kết nối tài khoản ChấmPro</h2>
          <p>Bạn sẽ tự động trở lại ứng dụng sau khi xác nhận đăng nhập.</p>
          <form id="cpapp-auto-pair" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" method="post">
            <input type="hidden" name="action" value="cpapp_pair">
            <input type="hidden" name="pair_code" value="<?php echo esc_attr($pair); ?>">
            <input type="hidden" name="auto_return" value="1">
            <?php wp_nonce_field('cpapp_pair'); ?>
            <button type="submit" style="padding:12px 18px;background:#1763c8;color:white;border:0;border-radius:9px">Xác nhận và mở ChấmPro</button>
          </form>
          <p><small>Nếu chưa tự chuyển, bấm nút trên.</small></p>
        </div>
        <script>document.getElementById('cpapp-auto-pair').requestSubmit();</script>
        <?php return ob_get_clean();
    }
    $success = isset($_GET['connected']) && $_GET['connected'] === '1';
    ob_start(); ?>
    <section class="cpapp-panel" style="max-width:660px;margin:24px auto;padding:22px;border:1px solid #dce5f0;border-radius:16px">
      <h2>ChấmPro – Tài khoản và nâng cấp gói</h2>
      <p><?php echo esc_html(wp_get_current_user()->display_name ?: 'Tài khoản mrhien.com'); ?> · Tài khoản đã đăng nhập</p>
      <?php if ($success): ?><p role="status" style="color:#176343">Đã ghép nối tài khoản. Quay lại ứng dụng ChấmPro để tự nhận quyền.</p><?php endif; ?>
      <h3>1. Kết nối ứng dụng</h3>
      <p>Trên điện thoại ChấmPro, bấm <b>Đăng ký và đăng nhập</b> để lấy mã kết nối; mã chỉ có hiệu lực 10 phút.</p>
      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <input type="hidden" name="action" value="cpapp_pair">
        <?php wp_nonce_field('cpapp_pair'); ?>
        <label for="cpapp_pair_code">Mã kết nối trên điện thoại</label>
        <input id="cpapp_pair_code" name="pair_code" type="text" required maxlength="9"
          pattern="[A-HJ-NP-Z2-9]{9}" autocomplete="one-time-code"
          style="padding:12px;width:100%;max-width:300px;display:block;margin:8px 0">
        <button type="submit" style="padding:12px 18px;border:0;border-radius:8px;background:#1763cb;color:white">Kết nối tài khoản với ChấmPro</button>
      </form>
      <hr style="margin:22px 0">
      <h3>2. Chọn gói sử dụng</h3>
      <p>Thanh toán được xử lý trên WooCommerce, QR ngân hàng do SePay hiển thị theo từng đơn. Sau khi ngân hàng xác nhận, mở lại ứng dụng để tự nhận quyền.</p>
      <?php
      if (cpapp_shop_ready()) {
          foreach (array('annual'=>'Gói 1 năm','lifetime'=>'Gói trọn đời') as $plan=>$title) {
              $product = wc_get_product(cpapp_plan_product($plan));
              if (!$product || !$product->is_purchasable()) continue;
              echo '<form data-cp-plan="' . esc_attr($plan) . '" method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="margin:10px 0;padding:14px;border:1px solid #e1e7ef;border-radius:10px">';
              echo '<strong>' . esc_html($title) . '</strong> · ' . wp_kses_post($product->get_price_html());
              echo '<input type="hidden" name="action" value="cpapp_buy"><input type="hidden" name="plan" value="' . esc_attr($plan) . '">';
              wp_nonce_field('cpapp_buy');
              echo '<button type="submit" style="display:block;margin-top:12px;padding:10px 16px;border:0;border-radius:9px;background:#1565c0;color:white">Thanh toán bằng QR ngân hàng</button></form>';
          }
      } else echo '<p>Chưa cấu hình mua gói WooCommerce, không tạo đơn hàng.</p>';
      ?>
      <p><small>Không cấp quyền khi người dùng chỉ bấm “Đã chuyển khoản”. Gói chỉ kích hoạt sau khi máy chủ xác minh thanh toán thực tế.</small></p>
    </section>
    <script>(function(){
      const h=new URLSearchParams((location.hash||'').slice(1));
      const pair=(h.get('pair')||'').toUpperCase();
      if(/^[A-HJ-NP-Z2-9]{9}$/.test(pair)){const x=document.getElementById('cpapp_pair_code');if(x)x.value=pair;}
      const plan=h.get('plan');
      if(plan==='annual'||plan==='lifetime'){document.querySelector('[data-cp-plan="'+plan+'"]')?.scrollIntoView();}
      if(location.hash)history.replaceState(null,'',location.pathname+location.search);
    })()</script>
    <?php return ob_get_clean();
});
add_action('admin_post_cpapp_pair', function () {
    if (!is_user_logged_in() || !check_admin_referer('cpapp_pair')) wp_die('Bạn cần đăng nhập và thử lại.', 'ChấmPro',array('response'=>403));
    if (!cpapp_ready()) wp_die('ChấmPro chưa cấu hình tài khoản.', 'ChấmPro',array('response'=>503));
    $code = strtoupper(sanitize_text_field(wp_unslash($_POST['pair_code'] ?? '')));
    if (!preg_match('/^[A-HJ-NP-Z2-9]{9}$/',$code)) wp_die('Mã kết nối không hợp lệ.', 'ChấmPro',array('response'=>400));
    $user=wp_get_current_user();
    $account=champro_bridge_account($user);
    if (is_wp_error($account)) wp_die('Không đồng bộ được tài khoản ChấmPro.', 'ChấmPro',array('response'=>503));
    $result=champro_bridge_request(array('action'=>'approve-pair','wpUserId'=>(int)$user->ID,'pairCode'=>$code));
    if (is_wp_error($result) || empty($result['paired'])) wp_die('Mã đã hết hạn hoặc chưa ghép nối được. Hãy tạo mã mới trong ứng dụng.', 'ChấmPro',array('response'=>409));
    if (isset($_POST['auto_return']) && $_POST['auto_return'] === '1') cpapp_auth_return_page($code);
    wp_safe_redirect(add_query_arg('connected','1',cpapp_safe_checkout_url()));exit;
});
add_action('admin_post_cpapp_buy', function () {
    if (!is_user_logged_in() || !check_admin_referer('cpapp_buy')) wp_die('Bạn cần đăng nhập.', 'ChấmPro',array('response'=>403));
    if (!cpapp_shop_ready()) wp_die('Chưa cấu hình WooCommerce và ChấmPro.', 'ChấmPro',array('response'=>503));
    $plan = sanitize_key(wp_unslash($_POST['plan'] ?? ''));
    if (!in_array($plan,array('annual','lifetime'),true)) wp_die('Gói không hợp lệ.', 'ChấmPro',array('response'=>400));
    $product=wc_get_product(cpapp_plan_product($plan));
    if (!$product || !$product->is_purchasable()) wp_die('Gói chưa được mở bán.', 'ChấmPro',array('response'=>400));
    // Explicit price contract matches the isolated Worker. Avoid taking amount from user input.
    $price=$plan==='annual'?99000:299000;
    if (get_woocommerce_currency()!=='VND' || abs((float)$product->get_price()-$price)>0.001)
        wp_die('Giá WooCommerce khác cấu hình ChấmPro. Chưa tạo đơn.', 'ChấmPro',array('response'=>503));
    $u=wp_get_current_user();
    $order=wc_create_order(array('customer_id'=>(int)$u->ID,'created_via'=>'champro-app'));
    if (is_wp_error($order)) wp_die('Không thể tạo đơn hàng.', 'ChấmPro',array('response'=>503));
    $order->add_product($product,1);
    $order->set_billing_email($u->user_email);
    $order->set_billing_first_name($u->display_name);
    $order->calculate_totals();
    if (abs((float)$order->get_total()-$price)>0.001) {
        $order->delete(true);
        wp_die('Tổng đơn hàng không khớp giá ChấmPro.', 'ChấmPro',array('response'=>503));
    }
    $order->update_meta_data('_cpapp_plan',$plan);
    $order->save();
    // Order-pay displays the configured WooCommerce/SePay dynamic QR.
    wp_safe_redirect($order->get_checkout_payment_url());exit;
});
function cpapp_activate_paid_order($id) {
    if (!cpapp_ready() || !function_exists('wc_get_order')) return;
    $order=wc_get_order($id);
    if (!$order || !$order->get_user_id() || !$order->is_paid() || !$order->get_date_paid()) return;
    // Only the configured SePay payment gateway may activate a QR purchase.
    if (!defined('CHAMPRO_SEPAY_GATEWAY_ID') || !$order->get_payment_method() ||
        $order->get_payment_method()!==CHAMPRO_SEPAY_GATEWAY_ID) return;
    $items=$order->get_items();
    if(count($items)!==1) return;
    $item=reset($items);if((int)$item->get_quantity()!==1)return;
    $pid=(int)$item->get_product_id();
    $plan=$pid===(int)CHAMPRO_ANNUAL_PRODUCT_ID?'annual':
          ($pid===(int)CHAMPRO_LIFETIME_PRODUCT_ID?'lifetime':'');
    if (!$plan) return;
    $amount=$plan==='annual'?99000:299000;
    if ($order->get_currency()!=='VND'||abs((float)$order->get_total()-$amount)>0.001)return;
    $user=get_user_by('id',$order->get_user_id());
    if (!$user || is_wp_error(champro_bridge_account($user)))return;
    $saved=champro_bridge_request(array('action'=>'paid-order',
        'wpUserId'=>(int)$user->ID,'orderId'=>(int)$order->get_id(),
        'productId'=>$pid,'plan'=>$plan,'amountVnd'=>$amount,'orderStatus'=>'completed'));
    if(is_wp_error($saved)) {
        $order->add_order_note('ChấmPro v14: Chưa đồng bộ quyền; tự động thử lại sau 5 phút.');
        if (!wp_next_scheduled('cpapp_retry_paid_order', array((int)$order->get_id()))) {
            wp_schedule_single_event(time()+300,'cpapp_retry_paid_order',array((int)$order->get_id()));
        }
    } else {
        if (!$order->get_meta('_cpapp_license_synced')) {
            $order->update_meta_data('_cpapp_license_synced',1);
            $order->save();
            $order->add_order_note('ChấmPro v14: Đã xác minh và đồng bộ quyền sử dụng.');
        }
    }
}
add_action('woocommerce_payment_complete','cpapp_activate_paid_order',25,1);
add_action('woocommerce_order_status_processing','cpapp_activate_paid_order',25,1);
add_action('woocommerce_order_status_completed','cpapp_activate_paid_order',25,1);

add_action('cpapp_retry_paid_order','cpapp_activate_paid_order',25,1);
