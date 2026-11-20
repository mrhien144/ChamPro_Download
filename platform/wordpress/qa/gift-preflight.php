<?php
// Temporary admin-only preflight, appended to the backed-up Direct Login 0.5.2.
// Requires the candidate's read-only cloud helpers, but keeps legacy issuance.
// Removed when the verified final plugin is installed. No activation hook,
// database writes, credentials, public REST route or usable app token output.
defined('ABSPATH') || exit;
function cpd_gift_preflight_result($uid) {
    if(!current_user_can('manage_options'))return cpd_fail('Không đủ quyền kiểm tra.',403);
    if(!is_int($uid)||$uid<1||!($user=get_userdata($uid)))return cpd_fail('Mã tài khoản không hợp lệ.',400);
    $cloud=cpd_cloud_entitlement($user);
    if(is_wp_error($cloud))return $cloud;
    $public=cpd_public_jwk();
    if(!$public)return cpd_fail('Không đọc được khóa công khai hiện có.',503);
    // Deliberately different issuer/audience: never an application license.
    $token=cpd_sign(array('iss'=>'champro-preflight','aud'=>'champro-preflight',
        'sub'=>'wp:'.$uid,'iat'=>time(),'exp'=>time()+60));
    if(is_wp_error($token))return $token;
    $parts=explode('.',$token);
    $key=openssl_pkey_get_details(openssl_pkey_get_private(cpd_private_pem()));
    $valid=openssl_verify($parts[0].'.'.$parts[1],cpd_sig_der(cpd_b64d($parts[2])),$key['key'],OPENSSL_ALGO_SHA256)===1;
    if(!$valid)return cpd_fail('Kiểm tra chữ ký không đạt.',503);
    return array('account_id'=>'wp:'.$uid,'plan'=>$cloud['plan'],
        'expires_at'=>$cloud['expires']?gmdate('Y-m-d H:i:s',$cloud['expires']):'—',
        'signature_valid'=>true,'public_key_sha256'=>hash('sha256',wp_json_encode($public)));
}
function cpd_gift_preflight_page() {
    if(!current_user_can('manage_options'))wp_die('Không đủ quyền.','ChấmPro',array('response'=>403));
    echo '<div class="wrap"><h1>Kiểm tra kết nối gói ChấmPro</h1><p>Chỉ đọc quyền từ Cloudflare và kiểm tra chữ ký hiện có. Không đổi gói, không tạo đơn, không đổi khóa và không bật đồng bộ dữ liệu.</p>';
    if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
        check_admin_referer('cpd_gift_preflight');
        $uid=filter_var($_POST['cpd_qa_uid']??null,FILTER_VALIDATE_INT);
        $result=cpd_gift_preflight_result($uid);
        if(is_wp_error($result))echo '<div class="notice notice-error"><p>'.esc_html($result->get_error_message()).'</p></div>';
        else{
            echo '<div class="notice notice-success"><p>ĐẠT: đọc đúng tài khoản và xác minh chữ ký máy chủ thành công.</p></div><table class="widefat"><tbody>';
            foreach($result as $label=>$value)echo '<tr><th>'.esc_html($label).'</th><td>'.esc_html($value===true?'ĐẠT':$value).'</td></tr>';
            echo '</tbody></table>';
        }
    }
    echo '<form method="post">';wp_nonce_field('cpd_gift_preflight');
    echo '<p><label for="cpd_qa_uid">ID WordPress cần kiểm tra</label> <input type="number" id="cpd_qa_uid" name="cpd_qa_uid" min="1" required></p><button type="submit" class="button button-primary">Kiểm tra chỉ đọc</button></form></div>';
}
add_action('admin_menu',function(){
    add_management_page('Kiểm tra gói ChấmPro','Kiểm tra gói ChấmPro','manage_options','champro-gift-check','cpd_gift_preflight_page');
});
