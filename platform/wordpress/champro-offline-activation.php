<?php
/**
 * Plugin Name: ChấmPro APK Offline Activation (v14 Staging)
 * Description: Generates device-bound signed offline licenses for verified mrhien.com users. Requires ChấmPro Bridge active.
 * Version: 0.1.0
 */
defined('ABSPATH') || exit;
add_shortcode('champro_offline_activate', function () {
    if (!is_user_logged_in()) {
        return '<p>Hãy <a href="' . esc_url(wp_login_url(get_permalink())) . '">đăng nhập hoặc đăng ký mrhien.com</a>, sau đó quay lại để kích hoạt ChấmPro.</p>';
    }
    if (!function_exists('champro_bridge_request')) {
        return '<p>Chức năng kích hoạt ChấmPro chưa sẵn sàng.</p>';
    }
    $html = '<div style="max-width:620px;margin:24px auto;padding:24px;border:1px solid #d8e2ee;border-radius:18px">';
    $html .= '<h2>Kích hoạt ChấmPro offline</h2><p>1. Mở ChấmPro trên điện thoại, sao chép <b>Mã thiết bị</b>.';
    $html .= '<br>2. Dán mã vào bên dưới, tạo giấy phép và sao chép lại vào ứng dụng.';
    $html .= '<br>3. Sau khi kích hoạt thành công, ứng dụng có thể chấm bài hoàn toàn offline.</p>';
    $html .= '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    $html .= '<input type="hidden" name="action" value="champro_offline_issue">';
    $html .= wp_nonce_field('champro_offline_issue', '_wpnonce', true, false);
    $html .= '<label for="cp-device">Mã thiết bị từ APK ChấmPro</label>';
    $html .= '<input id="cp-device" name="device_id" required pattern="cp-[a-fA-F0-9-]{36}" maxlength="39" autocomplete="off"';
    $html .= ' style="display:block;width:100%;box-sizing:border-box;padding:12px;margin:10px 0 16px">';
    $html .= '<button type="submit" style="padding:12px 20px;border:0;border-radius:9px;background:#1463d6;color:white">Tạo giấy phép kích hoạt</button></form></div>';
    return $html;
});
add_action('admin_post_champro_offline_issue', function () {
    if (!is_user_logged_in() || !check_admin_referer('champro_offline_issue')) {
        wp_die('Bạn cần đăng nhập và xác thực lại.', 'ChấmPro', array('response'=>403));
    }
    if (!function_exists('champro_bridge_request') || !function_exists('champro_bridge_account')) {
        wp_die('ChấmPro chưa cấu hình hệ thống bản quyền.', 'ChấmPro', array('response'=>503));
    }
    $device = isset($_POST['device_id']) ? sanitize_text_field(wp_unslash($_POST['device_id'])) : '';
    if (!preg_match('/^cp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $device)) {
        wp_die('Mã thiết bị không hợp lệ.', 'ChấmPro', array('response'=>400));
    }
    $user = wp_get_current_user();
    $account = champro_bridge_account($user);
    if (is_wp_error($account)) {
        wp_die(esc_html($account->get_error_message()), 'ChấmPro', array('response'=>503));
    }
    $issued = champro_bridge_request(array('action'=>'offline-license',
        'wpUserId'=>intval($user->ID),'deviceId'=>$device));
    if (is_wp_error($issued) || empty($issued['license'])) {
        $message = is_wp_error($issued) ? $issued->get_error_message() : 'Không tạo được giấy phép.';
        wp_die(esc_html($message), 'ChấmPro', array('response'=>503));
    }
    nocache_headers();
    header('Content-Type: text/html; charset=utf-8');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow', true);
    $code=esc_textarea($issued['license']);
    echo '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>Giấy phép ChấmPro</title><main style="max-width:680px;margin:28px auto;padding:20px;font:16px sans-serif">';
    echo '<h1>Giấy phép ChấmPro đã tạo</h1><p>Sao chép toàn bộ mã bên dưới và dán vào ứng dụng ChấmPro trên điện thoại.</p>';
    echo '<textarea id="cp-code" readonly rows="7" style="width:100%;box-sizing:border-box">' . $code . '</textarea>';
    echo '<p><button type="button" onclick="navigator.clipboard.writeText(document.getElementById(\'cp-code\').value).then(()=>this.textContent=\'Đã sao chép\')">Sao chép giấy phép</button></p>';
    echo '<p>Giấy phép chỉ dùng trên thiết bị đã đăng ký. Không cần mạng khi chấm bài.</p></main></html>';
    exit;
});
