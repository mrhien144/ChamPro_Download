<?php
/**
 * Plugin Name: ChấmPro Bridge (Staging)
 * Description: Connects verified WordPress customers and completed WooCommerce orders to the isolated ChấmPro licensing API.
 * Version: 0.1.1
 * Requires PHP: 7.4
 *
 * Do not activate until wp-config.php defines:
 * CHAMPRO_WORKER_URL, CHAMPRO_AUTH_SECRET, CHAMPRO_BRIDGE_SECRET,
 * CHAMPRO_ANNUAL_PRODUCT_ID, CHAMPRO_LIFETIME_PRODUCT_ID.
 *
 * Authentication happens only on the first-party mrhien.com page.
 * Signed bearer tokens are sent to the opener using postMessage, not URLs.
 */
defined('ABSPATH') || exit;
function champro_bridge_ready() {
    $keys = array('CHAMPRO_WORKER_URL', 'CHAMPRO_AUTH_SECRET', 'CHAMPRO_BRIDGE_SECRET',
        'CHAMPRO_ANNUAL_PRODUCT_ID', 'CHAMPRO_LIFETIME_PRODUCT_ID');
    foreach ($keys as $key) {
        if (!defined($key) || !constant($key)) {
            return false;
        }
    }
    return true;
}
function champro_bridge_url($path) {
    return rtrim(CHAMPRO_WORKER_URL, '/') . $path;
}
function champro_bridge_request($payload) {
    if (!champro_bridge_ready()) {
        return new WP_Error('champro_config', 'ChấmPro bridge chưa được cấu hình.');
    }
    $response = wp_remote_post(champro_bridge_url('/api/internal'), array(
        'timeout' => 15,
        'headers' => array(
            'Content-Type' => 'application/json',
            'X-Bridge-Secret' => CHAMPRO_BRIDGE_SECRET,
        ),
        'body' => wp_json_encode($payload),
    ));
    if (is_wp_error($response)) {
        return $response;
    }
    $status = wp_remote_retrieve_response_code($response);
    $json = json_decode(wp_remote_retrieve_body($response), true);
    if ($status < 200 || $status >= 300 || empty($json['ok'])) {
        return new WP_Error('champro_api', 'ChấmPro chưa xác nhận thao tác (' . intval($status) . ').');
    }
    return $json;
}
function champro_bridge_account($user) {
    return champro_bridge_request(array(
        'action' => 'account',
        'wpUserId' => intval($user->ID),
        'email' => $user->user_email,
        'name' => $user->display_name,
    ));
}
function champro_bridge_jwt($user) {
    $now = time();
    $encode = function ($input) {
        return rtrim(strtr(base64_encode(wp_json_encode($input)), '+/', '-_'), '=');
    };
    $header = $encode(array('alg' => 'HS256', 'typ' => 'JWT'));
    $payload = $encode(array(
        'iss' => 'https://mrhien.com',
        'aud' => 'champro-platform',
        'sub' => strval($user->ID),
        'iat' => $now,
        'exp' => $now + 900,
    ));
    $message = $header . '.' . $payload;
    return $message . '.' . rtrim(strtr(base64_encode(
        hash_hmac('sha256', $message, CHAMPRO_AUTH_SECRET, true)), '+/', '-_'), '=');
}
// Short-lived user token, only issued to an authenticated WordPress account.
// WordPress REST cookie authentication requires X-WP-Nonce.
add_action('rest_api_init', function () {
    register_rest_route('champro/v1', '/session', array(
        'methods' => 'POST',
        'permission_callback' => function () { return is_user_logged_in(); },
        'callback' => function () {
            if (!champro_bridge_ready()) {
                return new WP_Error('not_configured', 'ChấmPro chưa kích hoạt kết nối.', array('status' => 503));
            }
            $user = wp_get_current_user();
            $result = champro_bridge_account($user);
            if (is_wp_error($result)) {
                return new WP_Error('backend_error', 'Không kết nối được máy chủ ChấmPro.', array('status' => 503));
            }
            return rest_ensure_response(array('ok' => true, 'token' => champro_bridge_jwt($user)));
        },
    ));
});
// Render this shortcode on a PRIVATE first-party WordPress page at
// https://mrhien.com/champro-connect/ and open in a popup from ChấmPro.
// Temporary, first-party return intent so WooCommerce login AND registration
// take the user back to the bridge without ever exposing tokens in URLs.
function champro_bridge_mark_return() {
    if (headers_sent()) return;
    setcookie('champro_auth_return', '1', array(
        'expires' => time() + 900, 'path' => '/', 'secure' => is_ssl(),
        'httponly' => true, 'samesite' => 'Lax',
    ));
}
function champro_bridge_wants_return() {
    return isset($_COOKIE['champro_auth_return']) && $_COOKIE['champro_auth_return'] === '1';
}
function champro_bridge_return_url() {
    return home_url('/champro-connect/');
}
add_filter('woocommerce_login_redirect', function ($redirect, $user) {
    return champro_bridge_wants_return() ? champro_bridge_return_url() : $redirect;
}, 20, 2);
add_filter('woocommerce_registration_redirect', function ($redirect) {
    return champro_bridge_wants_return() ? champro_bridge_return_url() : $redirect;
}, 20, 1);
// Redirect before the theme prints HTML so the return-intent cookie is reliable.
add_action('template_redirect', function () {
    if (!is_page('champro-connect') || is_user_logged_in() || !champro_bridge_ready()) return;
    champro_bridge_mark_return();
    $account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '';
    if (!$account_url) return; // The shortcode still provides a manual fallback.
    wp_safe_redirect($account_url);
    exit;
}, 1);
add_shortcode('champro_connect', function () {
    if (!champro_bridge_ready()) {
        return '<p>ChấmPro chưa được cấu hình.</p>';
    }
    $account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '';
    if (!$account_url) $account_url = wp_login_url(champro_bridge_return_url());
    if (!is_user_logged_in()) {
        champro_bridge_mark_return();
        // mrhien.com account page owns registration/login UI, not wp-login.php.
        $url = esc_url($account_url);
        return '<div style="max-width:600px;margin:32px auto;padding:28px;border:1px solid #dae5f2;border-radius:18px;background:#fff">' .
          '<h2 style="margin-top:0">Đăng nhập hoặc đăng ký tài khoản HienSoft</h2>' .
          '<p>Đăng nhập bằng tài khoản mrhien.com để sử dụng ChấmPro. Chưa có tài khoản? Bạn có thể đăng ký miễn phí.</p>' .
          '<p>Đang mở trang tài khoản chính thức trên mrhien.com…</p>' .
          '<a href="' . $url . '" style="display:inline-block;background:#0969c3;color:#fff;padding:12px 19px;border-radius:9px;text-decoration:none">Đăng nhập / Đăng ký</a>' .
          '<script>window.location.replace(' . wp_json_encode(esc_url_raw($account_url)) . ');</script></div>';
    }
    if (champro_bridge_wants_return() && !headers_sent()) {
        setcookie('champro_auth_return', '', array(
            'expires' => time() - 3600, 'path' => '/', 'secure' => is_ssl(),
            'httponly' => true, 'samesite' => 'Lax',
        ));
    }
    $nonce = wp_create_nonce('wp_rest');
    $endpoint = rest_url('champro/v1/session');
    $script = '(async function(){var status=document.getElementById("cp-status");try{' .
      'if(!window.opener||window.opener.closed){status.textContent="Hãy quay lại ChấmPro và bấm Đăng nhập để kết nối tài khoản.";return;}' .
      'const res=await fetch(' . wp_json_encode($endpoint) . ',{method:"POST",credentials:"same-origin",headers:{"X-WP-Nonce":' .
      wp_json_encode($nonce) . '}});const data=await res.json();' .
      'if(!res.ok||!data.token)throw Error("Không thể xác thực tài khoản.");' .
      'window.opener.postMessage({type:"champro-session",token:data.token},"https://champro.mrhien.com");' .
      'status.textContent="Đã kết nối tài khoản. Đang trở về ChấmPro…";' .
      'setTimeout(function(){window.close();},850);' .
      '}catch(e){status.textContent="Kết nối chưa thành công: "+e.message;}})();';
    return '<div style="max-width:600px;margin:32px auto;padding:28px;border:1px solid #dae5f2;border-radius:18px;background:#fff;text-align:center">' .
      '<h2>Kết nối tài khoản ChấmPro</h2><p id="cp-status" role="status" aria-live="polite">Đang xác thực và trở về ChấmPro…</p>' .
      '<p>Chỉ xác nhận quyền sử dụng, không gửi dữ liệu học sinh.</p>' .
      '<p><a href="https://champro.mrhien.com/">Quay về ChấmPro</a></p>' .
      '</div><script>' . $script . '</script>';
});
// Only confirmed WooCommerce orders containing a single recognized ChấmPro
// license product are eligible for an activation. Never trust browser claims.
add_action('woocommerce_order_status_completed', function ($order_id) {
    if (!champro_bridge_ready() || !function_exists('wc_get_order')) {
        return;
    }
    $order = wc_get_order($order_id);
    if (!$order || !$order->get_user_id()) {
        return; // Guest orders must link/verify an account first.
    }
    $items = $order->get_items();
    if (count($items) !== 1) {
        return; // Avoid ambiguous bundled/mixed purchases.
    }
    $item = reset($items);
    if (intval($item->get_quantity()) !== 1) {
        return;
    }
    $pid = intval($item->get_product_id());
    $plan = $pid === intval(CHAMPRO_ANNUAL_PRODUCT_ID) ? 'annual' :
        ($pid === intval(CHAMPRO_LIFETIME_PRODUCT_ID) ? 'lifetime' : '');
    if (!$plan) {
        return;
    }
    $price = $plan === 'annual' ? 99000 : 299000;
    if ($order->get_currency() !== 'VND' || abs(floatval($order->get_total()) - $price) > 0.001) {
        return;
    }
    $user = get_user_by('id', $order->get_user_id());
    if (!$user || is_wp_error(champro_bridge_account($user))) {
        return;
    }
    $result = champro_bridge_request(array(
        'action' => 'paid-order',
        'wpUserId' => intval($user->ID),
        'orderId' => intval($order_id),
        'productId' => $pid,
        'plan' => $plan,
        'amountVnd' => $price,
        'orderStatus' => 'completed',
    ));
    if (is_wp_error($result)) {
        $order->add_order_note('ChấmPro: Chưa cấp được quyền tự động. Kiểm tra kết nối Worker và xử lý lại.');
    } else {
        $order->add_order_note('ChấmPro: Đã đồng bộ gói ' . $plan . ' cho tài khoản #' . $user->ID);
    }
}, 15, 1);
