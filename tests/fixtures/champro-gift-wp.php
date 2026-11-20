<?php
// Isolated WordPress adapter. All accounts, network replies and keys are fake.
define('ABSPATH','/test/');
class WP_Error {
    public $code,$message,$data;
    function __construct($code,$message,$data=null){$this->code=$code;$this->message=$message;$this->data=$data;}
}
class WP_REST_Request {
    private $body;
    function __construct($body){$this->body=$body;}
    function get_json_params(){return $this->body;}
}
function is_wp_error($value){return $value instanceof WP_Error;}
function wp_json_encode($value){return json_encode($value);}
function wp_parse_url($url){return parse_url($url);}
$GLOBALS['meta']=[];$GLOBALS['options']=[];$GLOBALS['transients']=[];
$GLOBALS['requests']=[];$GLOBALS['routes']=[];$GLOBALS['actions']=[];
$GLOBALS['cloud_ready']=true;$GLOBALS['cloud_url']='https://worker.example.invalid/api/me';
function add_action($hook,$callback){$GLOBALS['actions'][$hook][]=$callback;}
function add_filter(){}
function add_shortcode(){}
function register_activation_hook(){}
function register_rest_route($ns,$path,$args){$GLOBALS['routes']['/'.$ns.$path]=$args['callback'];}
function rest_ensure_response($value){return $value;}
function get_userdata($uid){return $uid>0?(object)['ID'=>$uid,'user_login'=>'qa-'.$uid]:false;}
function get_user_meta($uid,$key,$single){return $GLOBALS['meta'][$uid][$key]??'';}
function add_user_meta($uid,$key,$value,$unique){if(isset($GLOBALS['meta'][$uid][$key]))return false;$GLOBALS['meta'][$uid][$key]=$value;return true;}
function get_option($key,$default=false){return $GLOBALS['options'][$key]??$default;}
function add_option($key,$value){if(isset($GLOBALS['options'][$key]))return false;$GLOBALS['options'][$key]=$value;return true;}
function update_option($key,$value){$GLOBALS['options'][$key]=$value;return true;}
function get_transient($key){return $GLOBALS['transients'][$key]??false;}
function set_transient($key,$value,$ttl){$GLOBALS['transients'][$key]=$value;return true;}
function delete_transient($key){unset($GLOBALS['transients'][$key]);}
function champro_bridge_ready(){return $GLOBALS['cloud_ready'];}
function champro_bridge_url($path){if($path!=='/api/me')throw new Exception('Unexpected endpoint');return $GLOBALS['cloud_url'];}
function champro_bridge_jwt($user){return 'fake-token-for-user-'.$user->ID;}
function wp_remote_get($url,$args){$GLOBALS['requests'][]=[$url,$args];return $GLOBALS['cloud_response'];}
function wp_remote_retrieve_response_code($response){return $response['status'];}
function wp_remote_retrieve_body($response){return $response['body'];}
function cloud_reply($uid,$plan='annual',$expires=null,$status='active'){
    if($expires===null&&$plan==='annual')$expires=gmdate('Y-m-d H:i:s',time()+86400*365);
    $GLOBALS['cloud_response']=['status'=>200,'body'=>json_encode(['ok'=>true,
        'account'=>['id'=>'wp:'.$uid,'plan'=>$plan,'expiresAt'=>$expires,'status'=>$status]])];
}
function license_summary($value){
    if(is_wp_error($value))return ['error'=>true,'status'=>$value->data['status']??null];
    $payload=json_decode(base64_decode(strtr(explode('.',$value['license'])[1],'-_','+/')),true);
    return ['error'=>false,'plan'=>$value['plan'],'exp'=>$payload['exp'],'sub'=>$payload['sub'],
        'device'=>$payload['deviceId'],'issuer'=>$payload['iss'],'audience'=>$payload['aud'],
        'token'=>$value['license'],'username'=>$value['username']??null];
}
require __DIR__.'/../../platform/wordpress/champro-direct-login.php';
foreach($GLOBALS['actions']['rest_api_init']??[] as $callback)$callback();
// Model an already-working 0.5.2 installation key. Its unchanged public-key
// exporter requires OpenSSL to return 32-byte x/y coordinates. Some random
// test keys have a leading zero that OpenSSL omits; those are outside this
// gift-reconciliation fixture, not a reason to regenerate a production key.
$key=false;
for($attempt=0;$attempt<8;$attempt++){
    $candidate=openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1']);
    $details=openssl_pkey_get_details($candidate);
    if(strlen($details['ec']['x']??'')===32&&strlen($details['ec']['y']??'')===32){$key=$candidate;break;}
}
if(!$key)throw new RuntimeException('Could not create the isolated compatibility test key');
$pem='';openssl_pkey_export($key,$pem);$GLOBALS['options'][cpd_auto_key_option()]=$pem;
$GLOBALS['device']='cp-12345678-1234-4234-8234-123456789abc';
cloud_reply(42);
