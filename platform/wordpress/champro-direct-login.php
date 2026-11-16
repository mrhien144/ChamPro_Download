<?php
/**
 * Plugin Name: ChấmPro Direct Login (v14.5 STAGING)
 * Description: WordPress account -> one-time PKCE ticket -> signed offline device license. No Cloudflare Worker required for LOGIN.
 * Version: 0.5.2
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;
const CPD_LOGIN_PATH='/champro-login-app/';
const CPD_ISSUER='champro-platform';
const CPD_AUDIENCE='com.champro.nativepreview.v145';
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
function cpd_auto_key_option(){return 'cpd_offline_es256_key_v1';}
/**
 * Private key is NEVER sent to the app or the public API.
 * On first admin visit, create a stable key and store it as a non-autoload WordPress option.
 * Prefer CHAMPRO_LICENSE_PRIVATE_JWK in wp-config.php when explicitly configured.
 */
function cpd_generate_key_if_missing(){
    if(defined('CHAMPRO_LICENSE_PRIVATE_JWK'))return;
    if(get_option(cpd_auto_key_option(),false))return;
    if(!function_exists('openssl_pkey_new')||!defined('OPENSSL_KEYTYPE_EC'))return;
    $key=openssl_pkey_new(array('private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1'));
    if(!$key)return;
    $pem='';
    if(!openssl_pkey_export($key,$pem)||strpos($pem,'PRIVATE KEY')===false)return;
    // This is the only key for this installation. Never regenerate if present.
    add_option(cpd_auto_key_option(),$pem,'','no');
}
add_action('admin_init',function(){
    if(current_user_can('manage_options'))cpd_generate_key_if_missing();
});
function cpd_key_available(){
    if(defined('CHAMPRO_LICENSE_PRIVATE_JWK')&&is_string(CHAMPRO_LICENSE_PRIVATE_JWK)&&strlen(CHAMPRO_LICENSE_PRIVATE_JWK)>120)return true;
    return is_string(get_option(cpd_auto_key_option(),false))&&strlen(get_option(cpd_auto_key_option(),false))>100;
}
/* DER ECPrivateKey: nist P-256. Private key provided only through wp-config.php, NEVER in this repository. */
function cpd_private_pem(){
    if(!cpd_key_available())return false;
    if(!defined('CHAMPRO_LICENSE_PRIVATE_JWK'))return get_option(cpd_auto_key_option(),false);
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
/**
 * D1 is the single source of truth for ChấmPro subscriptions paid on web.
 * Never turn a failed entitlement lookup into a new trial/free license.
 * The Bridge secret remains server-side; the device never selects its plan.
 */
function cpd_authoritative_entitlement($uid) {
    if (!function_exists('champro_bridge_ready') ||
        !function_exists('champro_bridge_request') ||
        !champro_bridge_ready())
        return cpd_fail('Máy chủ chưa kết nối dịch vụ quyền sử dụng ChấmPro. Giấy phép cũ trên điện thoại vẫn được giữ.', 503);
    $result=champro_bridge_request(array('action'=>'entitlement','wpUserId'=>(int)$uid));
    if(is_wp_error($result)||!is_array($result)||empty($result['ok'])||
       (int)($result['wpUserId']??0)!==(int)$uid)
        return cpd_fail('Chưa xác minh được gói ChấmPro từ máy chủ. Không tự chuyển về dùng thử.', 503);
    return $result;
}
function cpd_utc_timestamp($s) {
    if(!is_string($s)||!preg_match('/^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z)?$/D',$s))return false;
    // D1 stores UTC SQLite DATETIME. Do not use local server timezone.
    $normal=str_replace('T',' ',rtrim($s,'Z'));
    return strtotime($normal.' UTC');
}
function cpd_license($user_id,$device) {
    $user=get_userdata($user_id);
    if(!$user||!cpd_device($device))return cpd_fail('Không nhận diện được tài khoản hoặc thiết bị',403);
    $entitlement=cpd_authoritative_entitlement($user_id);
    if(is_wp_error($entitlement))return $entitlement;
    $now=time();$plan=(string)($entitlement['plan']??'');
    if($plan==='lifetime'){$exp=4102444800;}
    elseif($plan==='annual'){
        $exp=cpd_utc_timestamp($entitlement['expiresAt']??null);
        if(!$exp||$exp<=$now)return cpd_fail('Ngày hết hạn gói 1 năm chưa hợp lệ hoặc đã hết hạn.', 402);
    }elseif($plan==='free'){
        // Trial is anchored to the original D1 account creation date, never
        // restarted by reinstalling or logging in on another device.
        $started=cpd_utc_timestamp($entitlement['trialStartedAt']??null);
        if(!$started)return cpd_fail('Chưa xác minh được ngày bắt đầu dùng thử trên máy chủ.',503);
        $exp=$started+CPD_TRIAL_DAYS*86400;
        if($exp<=$now)return cpd_fail('Đã hết thời gian dùng thử. Hãy mua gói ChấmPro.',402);
    }elseif($plan==='expired'){
        return cpd_fail('Gói ChấmPro đã hết hạn. Hãy gia hạn trên website.',402);
    }else{
        return cpd_fail('Máy chủ trả trạng thái gói không hợp lệ.',503);
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
    if(!cpd_key_available())return '<p>ChấmPro chưa có khóa bảo mật. Quản trị viên hãy mở wp-admin một lần để hệ thống khởi tạo khóa, sau đó tải lại trang.</p>';
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
    $target='champrotest145://auth/complete?ticket='.$ticket.'&state='.$ctx['state'];
    nocache_headers();
    header('Content-Type: text/html; charset=utf-8');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex,nofollow');
    echo '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>Trở về ChấmPro</title><main style="font:16px system-ui;max-width:520px;margin:40px auto;padding:16px">';
    echo '<h2>Đăng nhập thành công</h2><p>Đang quay lại ứng dụng ChấmPro…</p>';
    echo '<a href="'.esc_url($target,array('champrotest145')).'" style="display:inline-block;padding:14px;background:#1463ca;color:white;border-radius:10px">Mở ChấmPro</a>';
    echo '<p>Nếu trình duyệt hỏi, hãy xác nhận mở ứng dụng.</p>';
    echo '</main><script>location.replace('.wp_json_encode($target).');</script></html>';
    exit;
});
function cpd_public_jwk(){
    $pem=cpd_private_pem();
    if(!$pem)return false;
    $details=openssl_pkey_get_details(openssl_pkey_get_private($pem));
    if(!is_array($details)||empty($details['ec'])||empty($details['ec']['x'])||empty($details['ec']['y']))return false;
    if(strlen($details['ec']['x'])!==32||strlen($details['ec']['y'])!==32)return false;
    return array('kty'=>'EC','crv'=>'P-256','x'=>cpd_b64e($details['ec']['x']),
        'y'=>cpd_b64e($details['ec']['y']),'key_ops'=>array('verify'),'ext'=>true);
}
add_action('rest_api_init',function(){
    register_rest_route('champro/v2','/public-key',array('methods'=>'GET',
        'permission_callback'=>'__return_true','callback'=>function(){
            $key=cpd_public_jwk();
            if(!$key)return cpd_fail('ChấmPro chưa có khóa ký hợp lệ, quản trị viên cần mở wp-admin để cấu hình',503);
            return rest_ensure_response(array('ok'=>true,'publicKey'=>$key,'issuer'=>CPD_ISSUER,'audience'=>CPD_AUDIENCE));
        }));
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
          // The exchange is one-use and PKCE-bound. Register the public device
          // key only AFTER WordPress has proved account + app ownership.
          $registered=false;
          if(isset($b['syncPublicKey'])&&cpd_valid_device_jwk($b['syncPublicKey'])){
              $registered=cpd_register_device_key((int)$record['user_id'],$device,$b['syncPublicKey']);
          }
          $user=get_userdata((int)$record['user_id']);
          $license['username']=$user ? $user->user_login : '';
          $license['refreshDeviceRegistered']=$registered;
          // Data sync has its own backend and must not be claimed enabled here.
          $license['syncDeviceRegistered']=false;
          return rest_ensure_response($license);
       }));
});

// Device-bound entitlement refresh. Never accepts a client-supplied plan.
function cpd_valid_device_jwk($k) {
    return is_array($k)&&($k['kty']??'')==='EC'&&($k['crv']??'')==='P-256'&&
      preg_match('/^[A-Za-z0-9_-]{43}$/D',(string)($k['x']??''))&&
      preg_match('/^[A-Za-z0-9_-]{43}$/D',(string)($k['y']??''));
}
function cpd_device_option($device){return 'cpd_device_key_'.hash('sha256',$device);}
function cpd_register_device_key($uid,$device,$jwk){
    if(!cpd_device($device)||!cpd_valid_device_jwk($jwk))return false;
    $key=cpd_device_option($device);
    $value=array('uid'=>$uid,'device'=>$device,'jwk'=>array(
        'kty'=>'EC','crv'=>'P-256','x'=>$jwk['x'],'y'=>$jwk['y']));
    // Only a verified, successful PKCE ticket can call this function.
    if(get_option($key,false)===false)return add_option($key,$value,'','no');
    return update_option($key,$value,false)||get_option($key) === $value;
}
function cpd_device_key($uid,$device){
    $entry=get_option(cpd_device_option($device),false);
    return is_array($entry)&&(int)($entry['uid']??0)===$uid&&
      ($entry['device']??'')===$device&&cpd_valid_device_jwk($entry['jwk']??null)
      ?$entry['jwk']:false;
}
function cpd_signed_payload($uid,$device,$nonce){
    return "champro-license-refresh-v1\n".$uid."\n".$device."\n".$nonce;
}
function cpd_sig_der($raw) {
    if(!is_string($raw)||strlen($raw)!==64)return false;
    $parts=array();
    foreach(array(substr($raw,0,32),substr($raw,32,32)) as $value){
        $value=ltrim($value,"\x00");
        if($value==='')$value="\x00";
        if(ord($value[0])&0x80)$value="\x00".$value;
        $parts[]="\x02".chr(strlen($value)).$value;
    }
    $body=implode('',$parts);
    return "\x30".chr(strlen($body)).$body;
}
function cpd_verify_device_signature($jwk,$data,$signature){
    if(!cpd_valid_device_jwk($jwk)||!is_string($signature)||
       !preg_match('/^[A-Za-z0-9_-]{86}$/D',$signature))return false;
    $x=cpd_b64d($jwk['x']);$y=cpd_b64d($jwk['y']);$raw=cpd_b64d($signature);
    if(strlen((string)$x)!==32||strlen((string)$y)!==32)return false;
    $der=cpd_sig_der($raw);if(!$der)return false;
    $spki="\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01".
          "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00\x04".$x.$y;
    $pem="-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode($spki),64,"\n").
         "-----END PUBLIC KEY-----\n";
    return openssl_verify($data,$der,$pem,OPENSSL_ALGO_SHA256)===1;
}
function cpd_refresh_request($request){
    $b=$request->get_json_params();
    $uid=(int)($b['wpUserId']??0);
    $device=(string)($b['deviceId']??'');
    if($uid<1||!cpd_device($device)||!cpd_device_key($uid,$device))
       return cpd_fail('Thiết bị chưa được liên kết. Đăng nhập lại trên ứng dụng.',403);
    return array($b,$uid,$device);
}
add_action('rest_api_init',function(){
    register_rest_route('champro/v2','/refresh-challenge',array(
      'methods'=>'POST','permission_callback'=>'__return_true',
      'callback'=>function(WP_REST_Request $request){
        $args=cpd_refresh_request($request);if(is_wp_error($args))return $args;
        list($b,$uid,$device)=$args;
        $nonce=bin2hex(random_bytes(24));
        set_transient('cpd_refresh_'.hash('sha256',$uid.'|'.$device.'|'.$nonce),1,120);
        return rest_ensure_response(array('ok'=>true,'nonce'=>$nonce));
      }
    ));
    register_rest_route('champro/v2','/refresh-license',array(
      'methods'=>'POST','permission_callback'=>'__return_true',
      'callback'=>function(WP_REST_Request $request){
        $args=cpd_refresh_request($request);if(is_wp_error($args))return $args;
        list($b,$uid,$device)=$args;
        $nonce=(string)($b['nonce']??'');
        if(!preg_match('/^[a-f0-9]{48}$/D',$nonce))
            return cpd_fail('Mã thử thách không hợp lệ',400);
        $key='cpd_refresh_'.hash('sha256',$uid.'|'.$device.'|'.$nonce);
        if(!get_transient($key))return cpd_fail('Mã thử thách đã hết hạn hoặc được sử dụng',401);
        delete_transient($key); // single use, including failed signatures
        $jwk=cpd_device_key($uid,$device);
        if(!cpd_verify_device_signature($jwk,cpd_signed_payload($uid,$device,$nonce),$b['signature']??''))
            return cpd_fail('Không xác minh được chữ ký của điện thoại',403);
        $result=cpd_license($uid,$device);
        if(is_wp_error($result))return $result;
        $user=get_userdata($uid);
        $result['username']=$user ? $user->user_login : '';
        return rest_ensure_response($result);
      }
    ));
});
add_filter('rest_pre_serve_request',function($served,$result,$request){
    if(in_array($request->get_route(),array('/champro/v2/exchange','/champro/v2/public-key','/champro/v2/refresh-challenge','/champro/v2/refresh-license'),true)){
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
