<?php
/**
 * Plugin Name: ChấmPro Checkout Gate (Staging)
 * Description: A fail-closed checkout entry for ChấmPro plans; disabled unless explicitly configured.
 * Version: 0.1.2-staging
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;

// Do not enable until payment webhook, production licensing and API key rotation are verified.
function champro_checkout_is_enabled() {
    // Three separate administrator-controlled server-side confirmations.
    // No JavaScript switch or GET parameter can open a payment.
    return defined('CHAMPRO_LIVE_CHECKOUT_ENABLED') && CHAMPRO_LIVE_CHECKOUT_ENABLED === true
        && defined('CHAMPRO_LIVE_GRANTS_ENABLED') && CHAMPRO_LIVE_GRANTS_ENABLED === true
        && defined('CHAMPRO_PAYMENT_E2E_VERIFIED') && CHAMPRO_PAYMENT_E2E_VERIFIED === true;
}
function champro_checkout_system_ready() {
    if (!champro_checkout_is_enabled()) return false;
    if (!function_exists('champro_bridge_ready') || !champro_bridge_ready()) return false;
    if (!function_exists('WC') || !function_exists('wc_get_product')
        || !function_exists('get_woocommerce_currency')) return false;
    if (strtoupper(get_woocommerce_currency()) !== 'VND') return false;
    if (!WC() || !WC()->payment_gateways()) return false;
    $gateways = WC()->payment_gateways()->get_available_payment_gateways();
    if (!isset($gateways['sepay']) || $gateways['sepay']->enabled !== 'yes') return false;
    foreach (champro_checkout_plans() as $plan) {
        $product = wc_get_product($plan['id']);
        if (!$product || $product->get_status() !== 'publish'
            || !$product->is_virtual() || !$product->is_type('simple')
            || !$product->is_purchasable()
            || abs(floatval($product->get_price()) - $plan['price']) > 0.001) return false;
    }
    if (!defined('CHAMPRO_ANNUAL_PRODUCT_ID') || intval(CHAMPRO_ANNUAL_PRODUCT_ID) !== 8919
        || !defined('CHAMPRO_LIFETIME_PRODUCT_ID') || intval(CHAMPRO_LIFETIME_PRODUCT_ID) !== 8920
        || !function_exists('champro_bridge_request')) return false;
    // Fail closed unless the actual Cloudflare Worker responds with matching
    // live product IDs and a functioning D1 database. Never trust a frontend flag.
    $result = champro_bridge_request(array(
        'action' => 'checkout-preflight',
        'annualProductId' => 8919,
        'lifetimeProductId' => 8920,
    ));
    return !is_wp_error($result) && !empty($result['ready']);
}

// Read-only public readiness endpoint. Never expose configuration, keys or account data.
// Both the checkout POST and this endpoint use the same server-side prerequisites.
add_action('rest_api_init', function () {
    register_rest_route('champro/v1', '/checkout-readiness', array(
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function () {
            if (function_exists('nocache_headers')) nocache_headers();
            $ready = champro_checkout_system_ready();
            return rest_ensure_response(array(
                'ok' => true, 'ready' => $ready,
                'message' => $ready ? 'Cổng thanh toán ChấmPro đã sẵn sàng.' :
                    'Cổng thanh toán ChấmPro chưa được xác minh để mở bán.'
            ));
        },
    ));
});
function champro_checkout_plans() {
    return array(
        'annual' => array('id' => 8919, 'price' => 99000, 'name' => 'Gói 1 năm'),
        'lifetime' => array('id' => 8920, 'price' => 299000, 'name' => 'Gói trọn đời'),
    );
}
function champro_checkout_validate_plan($plan) {
    if (!champro_checkout_system_ready()) return new WP_Error('champro_closed', 'ChấmPro chưa mở bán. Không tạo đơn hàng.', array('status' => 503));
    if (!function_exists('WC') || !function_exists('wc_get_product')) return new WP_Error('champro_wc', 'WooCommerce chưa sẵn sàng.');
    if (!is_user_logged_in()) return new WP_Error('champro_login', 'Vui lòng đăng nhập trước khi thanh toán.');
    if (strtoupper(get_woocommerce_currency()) !== 'VND') return new WP_Error('champro_currency', 'Cửa hàng chưa thiết lập VND.');
    $plans = champro_checkout_plans();
    if (!isset($plans[$plan])) return new WP_Error('champro_plan', 'Gói không hợp lệ.');
    $item = $plans[$plan];
    $product = wc_get_product($item['id']);
    if (!$product || $product->get_status() !== 'publish' ||
        !$product->is_virtual() || !$product->is_type('simple') ||
        !$product->is_purchasable() ||
        abs(floatval($product->get_price()) - $item['price']) > 0.001) {
        return new WP_Error('champro_product', 'Gói hiện chưa sẵn sàng bán; không tạo thanh toán.');
    }
    if (!WC()->payment_gateways()) return new WP_Error('champro_gateway', 'Chưa khởi tạo cổng thanh toán.');
    $gateways = WC()->payment_gateways()->get_available_payment_gateways();
    if (!isset($gateways['sepay']) || $gateways['sepay']->enabled !== 'yes') {
        return new WP_Error('champro_gateway', 'SePay chưa sẵn sàng để thanh toán.');
    }
    return $item;
}

// WordPress page /champro-mua-goi/ must contain [champro_purchase].
// A GET request never modifies WooCommerce cart or creates an order.
add_shortcode('champro_purchase', function () {
    $plans = champro_checkout_plans();
    $plan = isset($_GET['plan']) ? sanitize_key(wp_unslash($_GET['plan'])) : '';
    if (!isset($plans[$plan])) return '<p>Vui lòng chọn gói từ trang ChấmPro.</p>';
    if (!champro_checkout_system_ready()) return '<p>Thanh toán ChấmPro chưa được mở. Vui lòng quay lại sau.</p>';
    if (!is_user_logged_in()) {
        $back = add_query_arg('plan', $plan, get_permalink());
        return '<p>Để mua gói, vui lòng đăng nhập tài khoản mrhien.com.</p><a href="' .
            esc_url(wp_login_url($back)) . '">Đăng nhập</a>';
    }
    $validated = champro_checkout_validate_plan($plan);
    if (is_wp_error($validated)) return '<p>' . esc_html($validated->get_error_message()) . '</p>';
    $label = esc_html($validated['name']);
    $price = esc_html(number_format($validated['price'], 0, ',', '.'));
    return '<section><h2>Kiểm tra thông tin trước khi thanh toán</h2>' .
      '<p>' . $label . ' — <strong>' . $price . 'đ</strong></p>' .
      '<p>Thanh toán qua WooCommerce/SePay; chưa có giao dịch nào được tạo.</p>' .
      '<form method="post">' .
      '<input type="hidden" name="champro_checkout_plan" value="' . esc_attr($plan) . '">' .
      wp_nonce_field('champro_checkout_' . $plan, 'champro_checkout_nonce', true, false) .
      '<button type="submit">Tiếp tục đến thanh toán</button></form></section>';
});
add_action('template_redirect', function () {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !is_page('champro-mua-goi')) return;
    if (!isset($_POST['champro_checkout_plan'])) return;
    if (!champro_checkout_system_ready()) wp_die('Thanh toán chưa được mở.', 'ChấmPro', array('response' => 503));
    $plan = sanitize_key(wp_unslash($_POST['champro_checkout_plan']));
    $nonce = isset($_POST['champro_checkout_nonce']) ? sanitize_text_field(wp_unslash($_POST['champro_checkout_nonce'])) : '';
    if (!wp_verify_nonce($nonce, 'champro_checkout_' . $plan)) wp_die('Yêu cầu đã hết hạn. Vui lòng tải lại trang.', 'ChấmPro', array('response' => 403));
    $validated = champro_checkout_validate_plan($plan);
    if (is_wp_error($validated)) wp_die(esc_html($validated->get_error_message()), 'ChấmPro', array('response' => 403));
    if (!WC()->cart) wp_die('Giỏ hàng chưa sẵn sàng.', 'ChấmPro', array('response' => 503));
    // Do not erase an existing cart, silently add unrelated products, or permit mixed orders.
    if (!WC()->cart->is_empty()) wp_die('Giỏ hàng hiện có sản phẩm khác. Vui lòng hoàn tất hoặc xóa giỏ hàng trước khi mua ChấmPro.', 'ChấmPro', array('response' => 409));
    if (!WC()->cart->add_to_cart($validated['id'], 1)) wp_die('Không thể thêm gói vào giỏ hàng.', 'ChấmPro', array('response' => 409));
    wp_safe_redirect(wc_get_checkout_url(), 303);
    exit;
}, 20);

/**
 * ChấmPro is sold in a single-item, authenticated, full-price SePay order.
 * Do not change gateways or coupons for ordinary mrhien.com purchases.
 * These checkout controls are enforced only when the cart has a ChấmPro ID.
 */
function champro_checkout_cart_plan() {
    if (!function_exists('WC') || !WC()->cart) return null;
    $plans = champro_checkout_plans();
    foreach (WC()->cart->get_cart() as $item) {
        $id = intval($item['product_id'] ?? 0);
        foreach ($plans as $slug => $product) {
            if ($id === $product['id']) return $slug;
        }
    }
    return null;
}
function champro_checkout_cart_issue() {
    $plan = champro_checkout_cart_plan();
    if ($plan === null) return '';
    if (!champro_checkout_system_ready()) return 'ChấmPro chưa mở thanh toán.';
    if (!is_user_logged_in()) return 'Vui lòng đăng nhập tài khoản trước khi mua ChấmPro.';
    if (strtoupper(get_woocommerce_currency()) !== 'VND') return 'Gói ChấmPro chỉ thanh toán bằng VND.';
    $items = WC()->cart->get_cart();
    $expected = champro_checkout_plans()[$plan];
    if (count($items) !== 1) return 'Mỗi đơn ChấmPro chỉ được có một gói.';
    $item = reset($items);
    if (intval($item['product_id'] ?? 0) !== $expected['id'] ||
        intval($item['quantity'] ?? 0) !== 1) return 'Không hỗ trợ ghép hoặc mua nhiều gói trong cùng một đơn.';
    if (abs(floatval(WC()->cart->get_total('edit')) - $expected['price']) > 0.001)
        return 'Số tiền ChấmPro chưa đúng giá niêm yết. Vui lòng kiểm tra giỏ hàng.';
    return '';
}
add_filter('woocommerce_available_payment_gateways', function ($gateways) {
    if (champro_checkout_cart_plan() === null) return $gateways;
    // Never allow Wallet, manual transfers or alternative gateways for a ChấmPro license.
    return isset($gateways['sepay']) ? array('sepay' => $gateways['sepay']) : array();
}, 20);
add_action('woocommerce_checkout_process', function () {
    $issue = champro_checkout_cart_issue();
    if ($issue !== '') wc_add_notice($issue, 'error');
    if (champro_checkout_cart_plan() !== null) {
        $method = isset($_POST['payment_method']) ? sanitize_key(wp_unslash($_POST['payment_method'])) : '';
        if ($method !== 'sepay') wc_add_notice('Gói ChấmPro yêu cầu thanh toán bằng SePay.', 'error');
    }
}, 20);
add_action('woocommerce_checkout_create_order', function ($order, $data) {
    $issue = champro_checkout_cart_issue();
    if ($issue !== '') throw new Exception($issue);
    $plan = champro_checkout_cart_plan();
    if ($plan === null) return;
    if (($data['payment_method'] ?? '') !== 'sepay')
        throw new Exception('Phương thức thanh toán ChấmPro không hợp lệ.');
    $expected = champro_checkout_plans()[$plan];
    if (abs(floatval($order->get_total()) - $expected['price']) > 0.001)
        throw new Exception('Tổng đơn ChấmPro không đúng giá.');
}, 20, 2);
