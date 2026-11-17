<?php
/**
 * Plugin Name: ChấmPro Sync Device Auth (Staging)
 * Description: Authenticated one-time device enrollment and short-lived sync tokens; does not modify payment or grading.
 * Version: 0.1.0-staging
 */
if (!defined('ABSPATH')) exit;

/*
 * OFF unless BOTH wp-config.php constants are explicitly set, and the
 * dedicated sync Worker has matching secret in Cloudflare Secret bindings.
 * The secret must never be placed in JavaScript, URLs or the WordPress DB.
 */
function cpsync_enabled() {
  return defined('CHAMPRO_SYNC_DEVICE_ENABLED') &&
    CHAMPRO_SYNC_DEVICE_ENABLED === true &&
    defined('CHAMPRO_SYNC_HMAC_SECRET') &&
    is_string(CHAMPRO_SYNC_HMAC_SECRET) &&
    strlen(CHAMPRO_SYNC_HMAC_SECRET) >= 32;
}
function cpsync_failure($message,$status=400){
  return new WP_Error('champro_sync_error',$message,array('status'=>$status));
}
function cpsync_b64url($bytes) {
  return rtrim(strtr(base64_encode($bytes),'+/','-_'),'=');
}
function cpsync_un64($s){
  if (!is_string($s) || !preg_match('/^[a-zA-Z0-9_-]+$/D',$s)) return false;
  $v=base64_decode(strtr($s,'-_','+/'),true);
  return $v===false?false:$v;
}
function cpsync_device($device){
  return is_string($device) && preg_match('/^cp-[0-9a-f-]{36}$/iD',$device);
}
function cpsync_key_meta($device){
  return '_champro_sync_key_'.hash('sha256',$device);
}
function cpsync_valid_jwk($jwk){
  if (!is_array($jwk) || ($jwk['kty']??null)!=='EC' ||
     ($jwk['crv']??null)!=='P-256') return false;
  $x=cpsync_un64($jwk['x']??'');
  $y=cpsync_un64($jwk['y']??'');
  if ($x===false||$y===false||strlen($x)!==32||strlen($y)!==32) return false;
  $pub=hex2bin('3059301306072A8648CE3D020106082A8648CE3D03010703420004').$x.$y;
  $pem="-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode($pub),64,"\n")."-----END PUBLIC KEY-----\n";
  $key=openssl_pkey_get_public($pem);
  return $key ? array('jwk'=>array('kty'=>'EC','crv'=>'P-256','x'=>$jwk['x'],'y'=>$jwk['y']), 'pem'=>$pem) : false;
}
function cpsync_asn1_length($len){
  if ($len<128) return chr($len);
  if ($len<256) return chr(0x81).chr($len);
  return chr(0x82).pack('n',$len);
}
function cpsync_es256_to_der($raw){
  if (!is_string($raw)||strlen($raw)!==64) return false;
  $pieces=array();
  foreach (array(substr($raw,0,32),substr($raw,32,32)) as $n){
    $n=ltrim($n,"\0");
    if ($n==='') $n="\0";
    if (ord($n[0])&0x80) $n="\0".$n;
    $pieces[]=chr(2).cpsync_asn1_length(strlen($n)).$n;
  }
  $seq=implode('',$pieces);
  return chr(0x30).cpsync_asn1_length(strlen($seq)).$seq;
}
function cpsync_identity_from_license($jwt,$device){
  if (!is_string($jwt) || strlen($jwt)>8192) return 0;
  $parts=explode('.',$jwt);
  if (count($parts)!==3) return 0;
  $payload=json_decode(cpsync_un64($parts[1]),true);
  if (!is_array($payload)||($payload['iss']??'')!=='champro-platform'||
      ($payload['aud']??'')!=='com.champro.nativepreview.v145'||
      ($payload['deviceId']??'')!==$device ||
      !preg_match('/^wp:([1-9][0-9]*)$/D',(string)($payload['sub']??''),$m)) return 0;
  return (int)$m[1];
}
/*
 * Device enrollment attaches only to an ALREADY SUCCESSFUL one-use,
 * signed-license exchange in the existing Direct Login plugin. This avoids
 * changing that working plugin or accepting unverified userId from client.
 */
add_filter('rest_post_dispatch',function($response,$server,$request){
  if (!cpsync_enabled() || $request->get_route()!=='/champro/v2/exchange' ||
      !($response instanceof WP_REST_Response) || $response->get_status()!==200) return $response;
  $input=$request->get_json_params();
  if (!is_array($input)||!isset($input['syncPublicKey'])) return $response;
  $data=$response->get_data();
  $device=$input['deviceId']??null;
  if (!cpsync_device($device)||!is_array($data)||empty($data['ok'])||empty($data['license'])) return $response;
  $uid=cpsync_identity_from_license($data['license'],$device);
  if (!$uid||!get_userdata($uid)) return $response;
  $key=cpsync_valid_jwk($input['syncPublicKey']);
  if (!$key) return $response; // Do not interrupt valid offline login.
  update_user_meta($uid,cpsync_key_meta($device),array('jwk'=>$key['jwk'],'registeredAt'=>time()));
  $data['syncDeviceRegistered']=true;
  $response->set_data($data);
  return $response;
},10,3);
function cpsync_validate_platform_token($jwt){
 if (!defined('CHAMPRO_AUTH_SECRET')||!is_string(CHAMPRO_AUTH_SECRET)||
     strlen(CHAMPRO_AUTH_SECRET)<32||!is_string($jwt)||strlen($jwt)>4096) return 0;
 $t=explode('.',$jwt);
 if (count($t)!==3) return 0;
 $header=json_decode(cpsync_un64($t[0]),true);
 $p=json_decode(cpsync_un64($t[1]),true);
 $sig=cpsync_un64($t[2]);
 if (!is_array($header)||!is_array($p)||$sig===false||
    ($header['alg']??'')!=='HS256'||($header['typ']??'')!=='JWT'||
    ($p['iss']??'')!=='https://mrhien.com'||
    ($p['aud']??'')!=='champro-platform'||!preg_match('/^[1-9][0-9]*$/D',(string)($p['sub']??'')))
    return 0;
 $now=time();
 if (!is_numeric($p['iat']??null)||!is_numeric($p['exp']??null)||
     (int)$p['iat']>$now+60||(int)$p['exp']<=$now||
     (int)$p['exp']>$now+1200) return 0;
 $actual=hash_hmac('sha256',$t[0].'.'.$t[1],CHAMPRO_AUTH_SECRET,true);
 if (!hash_equals($actual,$sig)) return 0;
 $uid=(int)$p['sub'];
 return get_userdata($uid)?$uid:0;
}
function cpsync_issue_token($uid,$device){
 $now=time();
 $head=cpsync_b64url(wp_json_encode(array('alg'=>'HS256','typ'=>'JWT')));
 $p=cpsync_b64url(wp_json_encode(array(
  'iss'=>'https://mrhien.com','aud'=>'champro-sync',
  'sub'=>(string)$uid,'deviceId'=>$device,'scope'=>'sync',
  'iat'=>$now,'exp'=>$now+600,'jti'=>bin2hex(random_bytes(12))
 )));
 $msg=$head.'.'.$p;
 return $msg.'.'.cpsync_b64url(hash_hmac('sha256',$msg,CHAMPRO_SYNC_HMAC_SECRET,true));
}
add_action('rest_api_init',function(){
  register_rest_route('champro/sync/v1','/web-token',array(
   'methods'=>'POST','permission_callback'=>'__return_true',
   'callback'=>function(WP_REST_Request $req){
     if(!cpsync_enabled())return cpsync_failure('Đồng bộ chưa kích hoạt',503);
     $b=$req->get_json_params();
     $uid=cpsync_validate_platform_token(is_array($b)?($b['platformToken']??null):null);
     if(!$uid)return cpsync_failure('Phiên web không hợp lệ; vui lòng đăng nhập lại',401);
     return rest_ensure_response(array('ok'=>true,'token'=>cpsync_issue_token($uid,'web'),'expiresIn'=>600));
   }));
  register_rest_route('champro/sync/v1','/challenge',array(
    'methods'=>'POST','permission_callback'=>'__return_true',
    'callback'=>function(WP_REST_Request $req){
      if (!cpsync_enabled()) return cpsync_failure('Đồng bộ chưa kích hoạt',503);
      $b=$req->get_json_params();
      $uid=(int)($b['wpUserId']??0);$device=$b['deviceId']??null;
      if ($uid<1||!cpsync_device($device)||!get_user_meta($uid,cpsync_key_meta($device),true))
        return cpsync_failure('Thiết bị chưa được đăng ký',403);
      $nonce=bin2hex(random_bytes(24));
      $key='cpsync_challenge_'.hash('sha256',$uid.':'.$device.':'.$nonce);
      set_transient($key,array('uid'=>$uid,'device'=>$device,'at'=>time()),120);
      return rest_ensure_response(array('ok'=>true,'nonce'=>$nonce,'expiresIn'=>120));
    }));
  register_rest_route('champro/sync/v1','/authorize',array(
    'methods'=>'POST','permission_callback'=>'__return_true',
    'callback'=>function(WP_REST_Request $req){
      if (!cpsync_enabled()) return cpsync_failure('Đồng bộ chưa kích hoạt',503);
      $b=$req->get_json_params();
      $uid=(int)($b['wpUserId']??0);$device=$b['deviceId']??null;
      $nonce=$b['nonce']??'';$sig=cpsync_un64($b['signature']??'');
      if ($uid<1||!cpsync_device($device)||!is_string($nonce)||
        !preg_match('/^[a-f0-9]{48}$/D',$nonce)||$sig===false||strlen($sig)!==64)
        return cpsync_failure('Yêu cầu xác thực không hợp lệ',401);
      $transient='cpsync_challenge_'.hash('sha256',$uid.':'.$device.':'.$nonce);
      $record=get_transient($transient);
      delete_transient($transient); // One time even when signature fails.
      if (!is_array($record)||($record['uid']??0)!==$uid||
        ($record['device']??'')!==$device||time()-(int)$record['at']>120)
        return cpsync_failure('Thử thách đã hết hạn hoặc được sử dụng',401);
      $saved=get_user_meta($uid,cpsync_key_meta($device),true);
      $key=cpsync_valid_jwk($saved['jwk']??null);
      if (!$key) return cpsync_failure('Khóa thiết bị không hợp lệ',403);
      $message="champro-sync-v1\n".$uid."\n".$device."\n".$nonce;
      $der=cpsync_es256_to_der($sig);
      if (!$der||openssl_verify($message,$der,$key['pem'],OPENSSL_ALGO_SHA256)!==1)
        return cpsync_failure('Chữ ký thiết bị không đúng',403);
      return rest_ensure_response(array('ok'=>true,'token'=>cpsync_issue_token($uid,$device),'expiresIn'=>600));
    }));
});
add_filter('rest_pre_serve_request',function($served,$result,$request){
  if (strpos($request->get_route(),'/champro/sync/v1/')!==0) return $served;
  if (in_array(($_SERVER['HTTP_ORIGIN']??''),array('https://localhost','https://champro.mrhien.com'),true)) {
    header('Access-Control-Allow-Origin: '.($_SERVER['HTTP_ORIGIN']??''));
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Vary: Origin',false);
  }
  header('Cache-Control: no-store');
  return $served;
},10,3);
