<?php
/**
 * Plugin Name: ChấmPro Direct Login (v14.4 STAGING)
 * Description: WordPress account -> one-time PKCE ticket -> signed offline device license. No Cloudflare Worker required for LOGIN.
 * Version: 0.4.0
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;
const CPD_LOGIN_PATH='/champro-login-app/';
const CPD_ISSUER='champro-platform';
const CPD_AUDIENCE='com.champro.nativepreview.v144';
const CPD_TRIAL_DAYS=7; // staging only; configure policy before public release
function cpd_fail($reason,$status=400){return new WP_Error('cpd_auth', $reason,array('status'=>$status));}
function cpd_b64e($s){return rtrim(strtr(base64_encode($s),'+/','-_'),'=');}
function cpd_b64d($s){return base64_decode(strtr($s,'-_','+/'),true);}
function cpd_sha($s){return cpd_b64e(hash('sha256',$s,true));}
function cpd_hex($s){return is_string($s)&&preg_match('/^[a-f0-9]{32,128}$/D',$s);}
function cpd_device($s){return is_string($s)&&preg_match('/^cp-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iD',$s);}
function cpd_context($args) {
    $state=sanitize_text_field($args['state']??'');
    $challenge=sanitize_text_field($args['challenge']??'');
    $device=sanitize_text_field($args['device']??'');
    if(!cpd_hex($state)||strlen($state)!==32||!preg_match('/^[A-Za-z0-9_-]{43}$/D',$challenge)||!cpd_device($device))return false;
    return compact('state','challenge','device');
}
function cpd_key_available(){return defined('CHAMPRO_LICENSE_PRIVATE_JWK') && is_string(CHAMPRO_LICENSE_PRIVATE_JWK) && strlen(CHAMPRO_LICENSE_PRIVATE_JWK)>120;}
/* DER ECPrivateKey: nist P-256. Private key provided only through wp-config.php, NEVER in this repository. */
function cpd_private_pem(){
    if(!cpd_key_available())return false;
    $j=json_decode(CHAMPRO_LICENSE_PRIVATE_JWK,true);
    if(!is_array($j)||($j['kty']??'')!=='EC'||($j['crv']??'')!=='P-256')return false;
    $d=cpd_b64d($j['d']??'');$x=cpd_b64d($j['x']??'');$y=cpd_b64d($j['y']??'');
    if(strlen((string)$d)!==32||strlen((string)$x)!==32||strlen((string)$y)!==32)return false;
    $data="\x02\x01\x01"."\x04\x20".$d."\xA0\x0A\x06\x08\x2A\x86\x48\xCE\x3D\x03\x01\x07".
          "\xA1\x44\x03\x42\x00\x04".$x.$y;
    return "-----BEGIN EC PRIVATE KEY-----\n".chunk_split(base64_encode("\x30".chr(strlen($data)).$data),64,"\n")."-----END EC PRIVATE KEY-----\n";
}
function cpd_der_raw($der) {
    $offset=0;$length=strlen($der);
    if($length<8||ord($der[$offset++])!==0x30)return false;
    $seq=ord($der[$offset++]);
    if($seq&0x80){$n=$seq&0x7f;if($n!==1||$offset>=$length)return false;$seq=ord($der[$offset++]);}
    if($seq!==$length-$offset)return false;
    $parts=[];
    foreach([0,1] as $_){
        if($offset+2>$length||ord($der[$offset++])!==2)return false;
        $n=ord($der[$offset++]);
        if($n<1||$n>33||$offset+$n>$length)return false;
        $v=substr($der,$offset,$n);$offset+=$n;
        $v=ltrim($v,"\x00");
        if(strlen($v)>32)return false;
        $parts[]=str_pad($v,32,"\x00",STR_PAD_LEFT);
    }
    return $offset===$length?implode('',$parts):false;
}
function cpd_sign($claims){
    $pem=cpd_private_pem();
    if(!$pem||!function_exists('openssl_sign'))return cpd_fail('Chưa cấu hình khóa ký giấy phép',503);
    $priv=openssl_pkey_get_private($pem);
    if(!$priv)return cpd_fail('Không đọc được khóa ký',503);
    $header=cpd_b64e(wp_json_encode(array('alg'=>'ES256','typ'=>'JWT')));
    $payload=cpd_b64e(wp_json_encode($claims));
    $message=$header.'.'.$payload;
    $der='';
    if(!openssl_sign($message,$der,$priv,OPENSSL_ALGO_SHA256))return cpd_fail('Không ký được giấy phép',503);
    $raw=cpd_der_raw($der);
    if(!$raw)return cpd_fail('Chữ ký máy chủ không đúng định dạng',503);
    return $message.'.'.cpd_b64e($raw);
}
function cpd_license($user_id,$device) {
    $user=get_userdata($user_id);
    if(!$user||!cpd_device($device))return cpd_fail('Không nhận diện được tài khoản hoặc thiết bị',403);
    $now=time();$plan='free';
    $configured=get_user_meta($user_id,'cpd_verified_plan',true);
    $expiry=(int)get_user_meta($user_id,'cpd_verified_expires',true);
    if($configured==='lifetime'){$plan='lifetime';$exp=4102444800;}
    elseif($configured==='annual'&&$expiry>$now){$plan='annual';$exp=$expiry;}
    else{
        $first=(int)get_user_meta($user_id,'cpd_trial_started',true);
        if(!$first){
            if(!add_user_meta($user_id,'cpd_trial_started',$now,true))$first=(int)get_user_meta($user_id,'cpd_trial_started',true);
            else $first=$now;
        }
        $exp=$first+CPD_TRIAL_DAYS*86400;
        if($exp<=$now)return cpd_fail('Đã hết thời gian dùng thử. Hãy mua gói ChấmPro.',402);
    }
    $claims=array('iss'=>CPD_ISSUER,'aud'=>CPD_AUDIENCE,'sub'=>'wp:'.$user_id,
       'deviceId'=>$device,'plan'=>$plan,'iat'=>$now,'exp'=>$exp);
    $token=cpd_sign($claims);
    if(is_wp_error($token))return $token;
    return array('ok'=>true,'license'=>$token,'plan'=>$plan,'expiresAt'=>gmdate('c',$exp));
}
register_activation_hook(__FILE__,function(){
    if(get_page_by_path('champro-login-app'))return;
    wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Đăng nhập ChấmPro',
      'post_name'=>'champro-login-app','post_content'=>'[champro_direct_login]',
      'comment_status'=>'closed','ping_status'=>'closed'));
});
add_shortcode('champro_direct_login',function(){
    $ctx=cpd_context($_GET);
    if(!$ctx)return '<p>Hãy mở trang này từ nút Đăng nhập trong ứng dụng ChấmPro.</p>';
    if(!is_user_logged_in()){
        $url=add_query_arg($ctx,home_url(CPD_LOGIN_PATH));
        $login=wp_login_url($url);
        return '<section style="max-width:480px;margin:30px auto"><h2>Đăng nhập ChấmPro</h2><p>Đăng nhập tài khoản mrhien.com. Bạn sẽ được đưa về ChấmPro tự động.</p><a href="'.
         esc_url($login).'">Đăng nhập / Đăng ký</a><script>location.replace('.wp_json_encode($login).');</script></section>';
    }
    if(!cpd_key_available())return '<p>ChấmPro chưa hoàn tất cấu hình máy chủ xác thực. Không thể cấp giấy phép.</p>';
    ob_start();?>
    <section style="max-width:480px;margin:30px auto;padding:20px;font:16px system-ui">
      <h2>Đang kết nối ChấmPro…</h2><p>Đang xác thực tài khoản và quay lại ứng dụng.</p>
      <form id="cpd-authorize" method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <input type="hidden" name="action" value="cpd_authorize">
        <?php foreach($ctx as $key=>$value):?><input type="hidden" name="<?php echo esc_attr($key); ?>" value="<?php echo esc_attr($value); ?>"><?php endforeach; ?>
        <?php wp_nonce_field('cpd_authorize'); ?>
        <button type="submit" style="padding:14px;background:#1463cb;color:white;border:0;border-radius:10px">Xác nhận đăng nhập ChấmPro</button>
      </form>
    </section><script>document.getElementById('cpd-authorize').requestSubmit();</script>
    <?php return ob_get_clean();
});
add_action('admin_post_cpd_authorize',function(){
    if(!is_user_logged_in()||!check_admin_referer('cpd_authorize'))wp_die('Cần xác thực lại tài khoản.', 'ChấmPro',array('response'=>403));
    $ctx=cpd_context($_POST);
    if(!$ctx||!cpd_key_available())wp_die('Không thể tạo phiên đăng nhập.', 'ChấmPro',array('response'=>503));
    // One-time exchange ticket. Browser receives ONLY ticket and state, not any private signing material.
    $ticket=bin2hex(random_bytes(24));
    $record=array('user_id'=>get_current_user_id(),'device'=>$ctx['device'],
      'challenge'=>$ctx['challenge'],'state'=>$ctx['state']);
    set_transient('cpd_ticket_'.$ticket,$record,180);
    $target='champrotest144://auth/complete?ticket='.$ticket.'&state='.$ctx['state'];
    nocache_headers();
    header('Content-Type: text/html; charset=utf-8');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex,nofollow');
    echo '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>Trở về ChấmPro</title><main style="font:16px system-ui;max-width:520px;margin:40px auto;padding:16px">';
    echo '<h2>Đăng nhập thành công</h2><p>Đang quay lại ứng dụng ChấmPro…</p>';
    echo '<a href="'.esc_url($target,array('champrotest144')).'" style="display:inline-block;padding:14px;background:#1463ca;color:white;border-radius:10px">Mở ChấmPro</a>';
    echo '<p>Nếu trình duyệt hỏi, hãy xác nhận mở ứng dụng.</p>';
    echo '</main><script>location.replace('.wp_json_encode($target).');</script></html>';
    exit;
});
add_action('rest_api_init',function(){
    register_rest_route('champro/v2','/exchange',array('methods'=>'POST','permission_callback'=>'__return_true',
       'callback'=>function(WP_REST_Request $req){
          $b=$req->get_json_params();
          if(!is_array($b))return cpd_fail('Dữ liệu không hợp lệ');
          $ticket=strtolower((string)($b['ticket']??''));
          $state=strtolower((string)($b['state']??''));
          $verifier=(string)($b['verifier']??'');
          $device=(string)($b['deviceId']??'');
          if(!preg_match('/^[a-f0-9]{48}$/D',$ticket)||!preg_match('/^[a-f0-9]{32}$/D',$state)||
            !preg_match('/^[a-f0-9]{64}$/D',$verifier)||!cpd_device($device))return cpd_fail('Phiên đăng nhập không hợp lệ',401);
          $key='cpd_ticket_'.$ticket;
          $record=get_transient($key);
          if(!is_array($record))return cpd_fail('Phiên đăng nhập đã hết hạn hoặc đã sử dụng',401);
          // Claim ticket before issuing a license to prevent replay.
          delete_transient($key);
          if(!hash_equals($record['state'],$state)||!hash_equals($record['device'],$device)||
             !hash_equals($record['challenge'],cpd_sha($verifier)))
              return cpd_fail('Không xác minh được thiết bị đăng nhập',403);
          $license=cpd_license((int)$record['user_id'],$device);
          if(is_wp_error($license))return $license;
          return rest_ensure_response($license);
       }));
});
add_filter('rest_pre_serve_request',function($served,$result,$request){
    if($request->get_route()==='/champro/v2/exchange'){
        $origin=$_SERVER['HTTP_ORIGIN']??'';
        if($origin==='https://localhost'){
            header('Access-Control-Allow-Origin: https://localhost');
            header('Vary: Origin',false);
            header('Access-Control-Allow-Headers: Content-Type');
            header('Access-Control-Allow-Methods: POST, OPTIONS');
        }
        header('Cache-Control: no-store');
    }
    return $served;
},10,3);
