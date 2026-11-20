<?php
/**
 * Plugin Name: ChấmPro Registration Companion
 * Description: Email-verified native registration and first ChấmPro login account sync. Does not modify payment, licensing keys, or grading.
 * Version: 0.1.0
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;
function cpr_error($message,$status=400){return new WP_Error('cpr_registration',$message,array('status'=>$status));}
function cpr_ready(){return function_exists('champro_bridge_ready')&&champro_bridge_ready()&&function_exists('champro_bridge_account')&&function_exists('cpd_context')&&function_exists('cpd_key_available')&&cpd_key_available();}
function cpr_key($kind,$value){return 'cpr_'.$kind.'_'.hash_hmac('sha256',(string)$value,wp_salt('auth'));}
function cpr_email($b){$email=strtolower(trim((string)($b['email']??'')));return strlen($email)<=200&&is_email($email)?$email:false;}
function cpr_rate($kind,$value,$limit,$ttl){
 $key=cpr_key($kind,$value);$n=(int)get_transient($key);
 if($n>=$limit)return false;
 set_transient($key,$n+1,$ttl);return true;
}
function cpr_with_lock($email,$callback){
 $key=cpr_key('lock',$email);
 // add_option is an atomic unique-key claim in WordPress. Fail closed on collision.
 if(!add_option($key,time(),'','no'))return cpr_error('Yêu cầu khác đang được xử lý. Hãy thử lại.',429);
 try{return $callback();}finally{delete_option($key);}
}
function cpr_payload($request){
 $raw=$request->get_body();if(strlen($raw)>8192)return array();
 $b=$request->get_json_params();return is_array($b)?$b:array();
}
function cpr_send($request){
 if(!cpr_ready())return cpr_error('Dịch vụ đăng ký chưa sẵn sàng.',503);
 $b=cpr_payload($request);$email=cpr_email($b);
 if(!$email)return cpr_error('Email không hợp lệ.');
 $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
 if(!cpr_rate('send_ip',$ip,20,HOUR_IN_SECONDS))return cpr_error('Quá nhiều yêu cầu. Hãy thử lại sau.',429);
 return cpr_with_lock($email,function()use($email){
  if(!cpr_rate('send_email',$email,1,60))return cpr_error('Vui lòng đợi trước khi gửi lại mã.',429);
  // Do not expose whether the email belongs to an existing WordPress user.
  if(email_exists($email))return rest_ensure_response(array('ok'=>true));
  $code=str_pad((string)random_int(0,99999999),8,'0',STR_PAD_LEFT);
  $key=cpr_key('code',$email);
  $record=array('hash'=>hash_hmac('sha256',$email.'|'.$code,wp_salt('auth')),'tries'=>0);
  if(!set_transient($key,$record,600))return cpr_error('Chưa thể lưu mã xác nhận. Hãy thử lại.',503);
  if(!wp_mail($email,'Mã xác nhận đăng ký ChấmPro','Mã xác nhận ChấmPro của bạn: '.$code.'. Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.')){
   delete_transient($key);return cpr_error('Chưa gửi được mã xác nhận. Vui lòng thử lại.',503);
  }
  return rest_ensure_response(array('ok'=>true));
 });
}
function cpr_complete($request){
 if(!cpr_ready())return cpr_error('Dịch vụ đăng ký chưa sẵn sàng.',503);
 $b=cpr_payload($request);$email=cpr_email($b);
 $code=(string)($b['code']??'');$username=(string)($b['username']??'');$password=(string)($b['password']??'');
 $name=sanitize_text_field((string)($b['name']??''));
 $ctx=cpd_context($b);
 if(!$email||!preg_match('/^[0-9]{8}$/D',$code)||!$ctx)return cpr_error('Thông tin xác nhận chưa hợp lệ.');
 if(!preg_match('/^[A-Za-z0-9_.-]{3,60}$/D',$username)||!validate_username($username))return cpr_error('Tên đăng nhập từ 3–60 ký tự, chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
 if(strlen($password)<10||strlen($password)>128||strlen($name)<1||strlen($name)>400)return cpr_error('Hãy kiểm tra họ tên và mật khẩu (10–128 byte).');
 $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
 if(!cpr_rate('verify_ip',$ip,60,HOUR_IN_SECONDS))return cpr_error('Quá nhiều yêu cầu. Hãy thử lại sau.',429);
 return cpr_with_lock($email,function()use($email,$code,$username,$password,$name,$ctx){
  $key=cpr_key('code',$email);$record=get_transient($key);
  if(!is_array($record)||($record['tries']??5)>=5)return cpr_error('Mã không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.');
  if(!hash_equals((string)$record['hash'],hash_hmac('sha256',$email.'|'.$code,wp_salt('auth')))){
   $record['tries']++;
   if($record['tries']>=5)delete_transient($key);else set_transient($key,$record,600);
   return cpr_error('Mã không hợp lệ hoặc đã hết hạn.');
  }
  if(email_exists($email)) {delete_transient($key);return cpr_error('Không thể tạo tài khoản. Hãy đăng nhập hoặc khôi phục mật khẩu.',409);}
  if(username_exists($username))return cpr_error('Tên đăng nhập không khả dụng. Hãy chọn tên khác.',409);
  // WordPress hashes the password; never store the cleartext in an option or log.
  $uid=wp_insert_user(array('user_login'=>$username,'user_email'=>$email,'user_pass'=>$password,'display_name'=>$name,'role'=>'subscriber'));
  if(is_wp_error($uid))return cpr_error('Không thể tạo tài khoản. Hãy kiểm tra thông tin đăng ký.',409);
  delete_transient($key);
  $user=get_userdata($uid);
  $sync=$user?champro_bridge_account($user):false;
  if(is_wp_error($sync)||!is_array($sync)||empty($sync['ok'])){
   // Account remains valid. The next authenticated app login retries sync.
   return cpr_error('Đã tạo tài khoản mrhien.com nhưng chưa đồng bộ ChấmPro. Hãy quay lại đăng nhập bằng tài khoản vừa tạo.',503);
  }
  $ticket=bin2hex(random_bytes(24));
  if(!set_transient('cpd_ticket_'.$ticket,array('user_id'=>(int)$uid,'device'=>$ctx['device'],'challenge'=>$ctx['challenge'],'state'=>$ctx['state']),180))
   return cpr_error('Đã tạo tài khoản. Hãy quay lại đăng nhập để kích hoạt.',503);
  return rest_ensure_response(array('ok'=>true,'ticket'=>$ticket,'state'=>$ctx['state']));
 });
}
add_action('rest_api_init',function(){
 register_rest_route('champro-registration/v1','/code',array('methods'=>'POST','permission_callback'=>'__return_true','callback'=>'cpr_send'));
 register_rest_route('champro-registration/v1','/complete',array('methods'=>'POST','permission_callback'=>'__return_true','callback'=>'cpr_complete'));
});
// Only sync verified ChấmPro-specific logins, not unrelated HienSoft registrations.
// The existing bridge upsert updates profile fields, never plan, credits or created_at.
add_action('admin_post_cpd_authorize',function(){
 if(!is_user_logged_in()||!cpr_ready()||!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['_wpnonce']??'')),'cpd_authorize')||!cpd_context($_POST))return;
 champro_bridge_account(wp_get_current_user());
},1);
