/* ChấmPro platform, isolated Worker. Not active until explicitly deployed. */
const LIMITS={scan:100,mix:5,qr:5},PRICES={annual:99000,lifetime:299000};
const txt=new TextEncoder();
const send=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const error=(message,status=400)=>send({ok:false,error:message},status);
function raw64(s){const a=atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));return Uint8Array.from(a,c=>c.charCodeAt(0));}
function parse64(s){return JSON.parse(new TextDecoder().decode(raw64(s)));}
async function hmacKey(secret,usage=['verify']){return crypto.subtle.importKey('raw',txt.encode(secret),{name:'HMAC',hash:'SHA-256'},false,usage);}
async function session(req,env){
 const bearer=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get('Authorization')||'');
 if(!bearer)throw Object.assign(Error('Cần đăng nhập'),{status:401});
 const t=bearer[1].split('.');
 if(t.length!==3)throw Object.assign(Error('Token không hợp lệ'),{status:401});
 let head,claims;
 try{head=parse64(t[0]);claims=parse64(t[1]);}
 catch{throw Object.assign(Error('Token bị lỗi'),{status:401});}
 const valid=head.alg==='HS256'&&head.typ==='JWT'&&await crypto.subtle.verify(
  'HMAC',await hmacKey(env.AUTH_HMAC_SECRET),raw64(t[2]),txt.encode(t[0]+'.'+t[1]));
 const now=Math.floor(Date.now()/1000),id=Number(claims.sub);
 if(!valid||claims.iss!=='https://mrhien.com'||claims.aud!=='champro-platform'||
  !Number.isSafeInteger(id)||id<=0||!Number.isInteger(claims.iat)||claims.iat>now+60||
  !Number.isInteger(claims.exp)||claims.exp<=now||claims.exp>now+3600)
  throw Object.assign(Error('Phiên đăng nhập không hợp lệ hoặc hết hạn'),{status:401});
 return {id:'wp:'+id,wpId:id};
}
async function body(req){
 const length=Number(req.headers.get('content-length')||0);
 if(length>32768)throw Object.assign(Error('Yêu cầu quá lớn'),{status:413});
 const s=await req.text();
 if(s.length>32768)throw Object.assign(Error('Yêu cầu quá lớn'),{status:413});
 try{return JSON.parse(s);}catch{throw Object.assign(Error('Dữ liệu JSON không hợp lệ'),{status:400});}
}
const adminIds=e=>new Set(String(e.ADMIN_WP_USER_IDS||'').split(',').map(x=>Number(x.trim())).filter(x=>Number.isSafeInteger(x)&&x>0));
const planOf=a=>a.status!=='active'?'suspended':a.plan==='lifetime'?'lifetime':
 a.plan==='annual'&&a.expires_at&&new Date(a.expires_at.replace(' ','T')+'Z').getTime()>Date.now()?'annual':'free';
async function profile(env,who){
 const a=await env.DB.prepare('SELECT * FROM accounts WHERE id=?').bind(who.id).first();
 if(!a)return error('Chưa đồng bộ tài khoản WordPress',404);
 const counts={scan:0,mix:0,qr:0};
 const rows=await env.DB.prepare('SELECT feature,COUNT(*) AS n FROM usage_events WHERE account_id=? GROUP BY feature').bind(who.id).all();
 for(const row of rows.results||[])if(row.feature in counts)counts[row.feature]=row.n;
 const bonus={scan:0,mix:0,qr:0};
 const credits=await env.DB.prepare('SELECT feature,COALESCE(SUM(amount),0) AS n FROM bonus_credits WHERE account_id=? GROUP BY feature').bind(who.id).all();
 for(const row of credits.results||[])if(Object.hasOwn(bonus,row.feature))bonus[row.feature]=Number(row.n||0);
 const plan=planOf(a),left=Object.fromEntries(Object.keys(LIMITS).map(k=>[k,plan==='suspended'?0:plan==='free'?Math.max(0,LIMITS[k]+bonus[k]-counts[k]):null]));
 return send({ok:true,account:{id:a.id,name:a.display_name,email:a.email,plan,expiresAt:a.expires_at,status:a.status},used:counts,bonus,left,limits:LIMITS,isAdmin:adminIds(env).has(who.wpId)});
}
async function secureBridge(req,env){
 const supplied=req.headers.get('X-Bridge-Secret')||'';
 if(!supplied)return false;
 const actual=await crypto.subtle.sign('HMAC',await hmacKey(supplied,['sign']),txt.encode('champro-authorized-bridge'));
 return crypto.subtle.verify('HMAC',await hmacKey(env.INTERNAL_BRIDGE_SECRET),actual,txt.encode('champro-authorized-bridge'));
}
async function internal(req,env){
 if(!await secureBridge(req,env))return error('Không đủ quyền',401);
 const b=await body(req);
 const uid=Number(b.wpUserId);
 if(!Number.isSafeInteger(uid)||uid<1)return error('Tài khoản không hợp lệ');
 const aid='wp:'+uid;
 if(b.action==='account'){
  const email=String(b.email||'').toLowerCase().trim(),name=String(b.name||'').trim().slice(0,120);
  if(email.length>250||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error('Email không hợp lệ');
  await env.DB.prepare('INSERT INTO accounts (id,wp_user_id,email,display_name) VALUES (?,?,?,?) ON CONFLICT(wp_user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP').bind(aid,uid,email,name).run();
  return send({ok:true,accountId:aid});
 }
 if(b.action==='inspect-sepay-test'){
  const order=Number(b.orderId);
  if(!Number.isSafeInteger(order)||order<1||order>9999999999)
    return error('Mã đơn thử nghiệm không hợp lệ');
  const paymentCode='DH'+String(order);
  const rows=await env.DB.prepare(
   'SELECT transaction_id,payment_code,amount_vnd,account_number,received_at FROM sepay_test_receipts WHERE payment_code=? ORDER BY received_at DESC LIMIT 10'
  ).bind(paymentCode).all();
  const receipts=(rows.results||[]).map(row=>({
   transactionId:row.transaction_id,
   paymentCode:row.payment_code,
   amountVnd:row.amount_vnd,
   accountMatches:String(row.account_number)===String(env.SEPAY_TEST_BANK_ACCOUNT),
   receivedAt:row.received_at
  }));
  // READ-ONLY INSPECTION: no grants, no order status changes, no bank secret disclosed.
  return send({ok:true,readOnly:true,orderId:order,receipts});
 }
 if(b.action==='settle-sepay-sandbox'){
  // STAGING ONLY: D1 HMAC-verified receipt => idempotent test entitlement.
  // Production authorization remains disabled; this never changes WooCommerce itself.
  if(String(env.SEPAY_TEST_SETTLEMENTS_ENABLED||'')!=='1')
   return error('Thanh toán thử nghiệm chưa được cho phép',403);
  const order=Number(b.orderId),product=Number(b.productId),amount=Number(b.amountVnd),
   plan=String(b.plan||''),created=Number(b.orderCreatedUnix),status=String(b.orderStatus||''),
   method=String(b.paymentMethod||'');
  const expectedProduct=plan==='annual'?Number(env.PRODUCT_ANNUAL_ID):plan==='lifetime'?Number(env.PRODUCT_LIFETIME_ID):0;
  const expectedAmount=plan==='annual'?99000:plan==='lifetime'?299000:0;
  // Only the known, reviewed manual test order may have an empty method.
  // Subsequent orders must explicitly use the separate staging-only payment method.
  const manualTest=(order===7734 && uid===3 && product===7726 && plan==='annual' && amount===99000 && method==='');
  if(!Number.isSafeInteger(order)||order<1||!Number.isSafeInteger(created)||created<1 ||
     product!==expectedProduct||amount!==expectedAmount||
     !['pending','on-hold'].includes(status) || !(method==='champro_sepay_test'||manualTest))
   return error('Đơn thử nghiệm không đủ điều kiện',422);
  const rows=await env.DB.prepare(
   'SELECT transaction_id,payment_code,amount_vnd,account_number,received_at FROM sepay_test_receipts WHERE payment_code=? LIMIT 2'
  ).bind('DH'+order).all();
  if(!rows.results || rows.results.length!==1)return error('Không có đúng một biên nhận thử nghiệm',409);
  const receipt=rows.results[0],receiptTime=Date.parse(String(receipt.received_at).replace(' ','T')+'Z');
  if(!Number.isSafeInteger(Number(receipt.transaction_id))||
     Number(receipt.amount_vnd)!==amount||
     String(receipt.account_number)!==String(env.SEPAY_TEST_BANK_ACCOUNT)||
     !Number.isFinite(receiptTime)||receiptTime<created*1000-120000||
     receiptTime>Date.now()+120000)
   return error('Giao dịch thử nghiệm không khớp thời gian, số tiền hoặc tài khoản ngân hàng',422);
  const account=await env.DB.prepare('SELECT id,plan,status FROM accounts WHERE id=?').bind(aid).first();
  if(!account || account.status!=='active')return error('Tài khoản thử nghiệm không hợp lệ',409);
  const existing=await env.DB.prepare(
   'SELECT * FROM sepay_test_settlements WHERE order_id=? OR transaction_id=?'
  ).bind(order,Number(receipt.transaction_id)).all();
  const claims=existing.results||[];
  if(claims.some(c=>Number(c.order_id)!==order||Number(c.transaction_id)!==Number(receipt.transaction_id)||
      c.account_id!==aid||Number(c.wp_user_id)!==uid||Number(c.product_id)!==product||
      c.plan!==plan||Number(c.amount_vnd)!==amount))
   return error('Giao dịch đã được dùng cho đơn hàng khác',409);
  if(claims.length===1 && claims[0].processed_at)
   return send({ok:true,testOnly:true,duplicate:true,orderId:order,accountId:aid});
  if(claims.length>1)return error('Biên nhận trùng bất thường',409);
  if(account.plan!=='free' && claims.length===0)return error('Tài khoản chưa đủ điều kiện nâng cấp thử nghiệm',409);
  const prior=await env.DB.prepare('SELECT * FROM payments WHERE order_id=?').bind(order).first();
  if(prior && claims.length===0)return error('Mã đơn đã được sử dụng',409);
  // A single atomic D1 batch serializes new settlement writes and rights update.
  await env.DB.batch([
   env.DB.prepare(
    'INSERT OR IGNORE INTO sepay_test_settlements (order_id,transaction_id,wp_user_id,account_id,product_id,plan,amount_vnd) VALUES (?,?,?,?,?,?,?)'
   ).bind(order,Number(receipt.transaction_id),uid,aid,product,plan,amount),
   env.DB.prepare(
    "INSERT OR IGNORE INTO payments (order_id,wp_user_id,account_id,product_id,plan,amount_vnd,status) SELECT order_id,wp_user_id,account_id,product_id,plan,amount_vnd,'completed' FROM sepay_test_settlements WHERE order_id=? AND account_id=? AND processed_at IS NULL"
   ).bind(order,aid),
   env.DB.prepare(
    "UPDATE accounts SET plan=?,expires_at=CASE WHEN ?='annual' THEN datetime('now','+1 year') ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND plan='free' AND EXISTS(SELECT 1 FROM sepay_test_settlements s JOIN payments p ON p.order_id=s.order_id WHERE s.order_id=? AND s.account_id=? AND s.processed_at IS NULL AND p.account_id=? AND p.product_id=? AND p.amount_vnd=? AND p.plan=?)"
   ).bind(plan,plan,aid,order,aid,aid,product,amount,plan),
   env.DB.prepare(
    "UPDATE payments SET processed_at=CURRENT_TIMESTAMP WHERE order_id=? AND account_id=? AND processed_at IS NULL AND EXISTS(SELECT 1 FROM sepay_test_settlements WHERE order_id=? AND account_id=? AND processed_at IS NULL)"
   ).bind(order,aid,order,aid),
   env.DB.prepare(
    "UPDATE sepay_test_settlements SET processed_at=CURRENT_TIMESTAMP WHERE order_id=? AND account_id=? AND processed_at IS NULL AND EXISTS(SELECT 1 FROM payments WHERE order_id=? AND account_id=? AND status='completed' AND processed_at IS NOT NULL)"
   ).bind(order,aid,order,aid)
  ]);
  const saved=await env.DB.prepare(
   'SELECT s.transaction_id,s.processed_at,a.plan,a.expires_at,p.product_id,p.amount_vnd,p.processed_at AS paid_at FROM sepay_test_settlements s JOIN accounts a ON a.id=s.account_id JOIN payments p ON p.order_id=s.order_id WHERE s.order_id=? AND s.account_id=?'
  ).bind(order,aid).first();
  if(!saved || Number(saved.transaction_id)!==Number(receipt.transaction_id)||
     !saved.processed_at||!saved.paid_at||saved.plan!==plan||
     Number(saved.product_id)!==product||Number(saved.amount_vnd)!==amount)
   return error('Chưa xác minh được việc cấp quyền thử nghiệm',409);
  return send({ok:true,testOnly:true,duplicate:false,orderId:order,accountId:aid,
    transactionId:receipt.transaction_id,plan,expiresAt:saved.expires_at});
 }
 if(b.action!=='paid-order')return error('Thao tác không hợp lệ');
 const plan=String(b.plan),order=Number(b.orderId),product=Number(b.productId),amount=Number(b.amountVnd);
 if(!Object.hasOwn(PRICES,plan)||!Number.isSafeInteger(order)||order<1||
  product!==Number(plan==='annual'?env.PRODUCT_ANNUAL_ID:env.PRODUCT_LIFETIME_ID)||
  amount!==PRICES[plan]||b.orderStatus!=='paid')return error('Đơn hàng, số tiền hoặc trạng thái không hợp lệ');
 const a=await env.DB.prepare('SELECT id FROM accounts WHERE id=?').bind(aid).first();
 if(!a)return error('Khách hàng chưa đăng ký ChấmPro',409);
 // Reject reused order IDs that belong to a different account, plan or amount.
 // Identical gateway retries are an idempotent no-op.
 const previous=await env.DB.prepare('SELECT * FROM payments WHERE order_id=?').bind(order).first();
 const matches=p=>p&&p.wp_user_id===uid&&p.account_id===aid&&
  p.product_id===product&&p.plan===plan&&p.amount_vnd===amount&&p.status==='completed';
 if(previous){
  if(!matches(previous))return error('Mã đơn hàng đã được sử dụng cho giao dịch khác',409);
  if(previous.processed_at)return send({ok:true,duplicate:true,accountId:aid,orderId:order});
 }
 // A single D1 batch ensures all statements commit or none commit.
 // processed_at IS NULL protects against duplicate paid-order notifications.
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO payments (order_id,wp_user_id,account_id,product_id,plan,amount_vnd,status) VALUES (?,?,?,?,?,?,'completed')").bind(order,uid,aid,product,plan,amount),
  env.DB.prepare("UPDATE accounts SET plan=CASE WHEN plan='lifetime' THEN 'lifetime' ELSE ? END,expires_at=CASE WHEN plan='lifetime' OR ?='lifetime' THEN NULL WHEN plan='annual' AND expires_at>datetime('now') THEN datetime(expires_at,'+1 year') ELSE datetime('now','+1 year') END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE order_id=? AND account_id=? AND plan=? AND amount_vnd=? AND processed_at IS NULL)").bind(plan,plan,aid,order,aid,plan,amount),
  env.DB.prepare("UPDATE payments SET processed_at=CURRENT_TIMESTAMP WHERE order_id=? AND account_id=? AND processed_at IS NULL").bind(order,aid)
 ]);
 // A concurrent request can race the pre-check. Validate persisted facts
 // before claiming success; never confirm a mismatched reused order ID.
 const saved=await env.DB.prepare('SELECT * FROM payments WHERE order_id=?').bind(order).first();
 if(!matches(saved)||!saved.processed_at)return error('Chưa xác nhận được quyền từ đơn hàng',409);
 return send({ok:true,duplicate:false,accountId:aid,orderId:order});
}
async function useCredit(env,who,feature,b){
 if(!Object.hasOwn(LIMITS,feature))return error('Chức năng không hợp lệ',404);
 const rid=String(b.requestId||'');
 if(!/^[A-Za-z0-9:_-]{16,96}$/.test(rid))return error('Mã thao tác không hợp lệ');
 const prev=await env.DB.prepare('SELECT account_id,feature FROM usage_events WHERE request_id=?').bind(rid).first();
 if(prev)return prev.account_id===who.id&&prev.feature===feature?send({ok:true,duplicate:true}):error('Mã thao tác trùng',409);
 // SQLite guards the free quota within the INSERT, preventing parallel
 // requests from overspending the five QR/mix credits or 100 scan credits.
 const res=await env.DB.prepare("INSERT INTO usage_events(request_id,account_id,feature,source) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND status='active' AND (plan='lifetime' OR (plan='annual' AND expires_at>datetime('now')) OR ((plan='free' OR (plan='annual' AND (expires_at IS NULL OR expires_at<=datetime('now')))) AND (SELECT COUNT(*) FROM usage_events WHERE account_id=? AND feature=?) < ? + (SELECT COALESCE(SUM(amount),0) FROM bonus_credits WHERE account_id=? AND feature=?)))) ON CONFLICT(request_id) DO NOTHING").bind(rid,who.id,feature,'web',who.id,who.id,feature,LIMITS[feature],who.id,feature).run();
 if(!res.meta?.changes){
  const second=await env.DB.prepare('SELECT account_id,feature FROM usage_events WHERE request_id=?').bind(rid).first();
  if(second?.account_id===who.id&&second.feature===feature)return send({ok:true,duplicate:true});
  return error('Hết lượt dùng thử hoặc tài khoản bị khóa',402);
 }
 return send({ok:true,duplicate:false,feature});
}
async function admin(env,who,path,req){
 if(!adminIds(env).has(who.wpId))return error('Không có quyền quản trị',403);
 if(path==='/api/admin/stats'){
  const byPlan=await env.DB.prepare('SELECT plan,status,COUNT(*) AS count FROM accounts GROUP BY plan,status').all();
  const used=await env.DB.prepare('SELECT feature,COUNT(*) AS count FROM usage_events GROUP BY feature').all();
  const revenue=await env.DB.prepare('SELECT COALESCE(SUM(amount_vnd),0) AS n FROM payments WHERE processed_at IS NOT NULL').first();
  return send({ok:true,byPlan:byPlan.results,used:used.results,revenueVnd:revenue.n});
 }
 if(path==='/api/admin/accounts'){
  const q='%'+String(new URL(req.url).searchParams.get('q')||'').slice(0,80)+'%';
  const list=await env.DB.prepare('SELECT id,email,display_name,plan,status,expires_at,created_at FROM accounts WHERE email LIKE ? OR display_name LIKE ? ORDER BY created_at DESC LIMIT 100').bind(q,q).all();
  const accounts=list.results||[];
  if(!accounts.length)return send({ok:true,accounts:[]});
  // The quotas shown in Super Admin are calculated from actual D1 records.
  // They do not grant access and never reset the previously recorded usage.
  const ids=accounts.map(a=>a.id),slots=ids.map(()=>'?').join(',');
  const [usageData,bonusData]=await Promise.all([
   env.DB.prepare('SELECT account_id,feature,COUNT(*) AS n FROM usage_events WHERE account_id IN ('+slots+') GROUP BY account_id,feature').bind(...ids).all(),
   env.DB.prepare('SELECT account_id,feature,COALESCE(SUM(amount),0) AS n FROM bonus_credits WHERE account_id IN ('+slots+') GROUP BY account_id,feature').bind(...ids).all()
  ]);
  const counts=new Map(),bonuses=new Map();
  for(const row of usageData.results||[])counts.set(row.account_id+':'+row.feature,Number(row.n)||0);
  for(const row of bonusData.results||[])bonuses.set(row.account_id+':'+row.feature,Number(row.n)||0);
  const enriched=accounts.map(a=>{
   const effectivePlan=planOf(a),quota={};
   for(const feature of Object.keys(LIMITS)){
    const included=LIMITS[feature],bonus=bonuses.get(a.id+':'+feature)||0,
     used=counts.get(a.id+':'+feature)||0,total=included+bonus;
    quota[feature]={included,bonus,used,total:effectivePlan==='free'?total:null,
     remaining:effectivePlan==='suspended'?0:effectivePlan==='free'?Math.max(0,total-used):null};
   }
   return {...a,effectivePlan,quota};
  });
  return send({ok:true,accounts:enriched});
 }
 if(path==='/api/admin/bonus'&&req.method==='POST'){
  const b=await body(req),ids=b.accountIds,feature=String(b.feature||''),
   amount=b.amount,reason=String(b.reason||'').trim(),requestId=String(b.requestId||'');
  if(!Array.isArray(ids)||ids.length<1||ids.length>100||
    ids.some(id=>typeof id!=='string'||!/^wp:[1-9]\d{0,12}$/.test(id))||
    new Set(ids).size!==ids.length||!Object.hasOwn(LIMITS,feature)||
    !Number.isSafeInteger(amount)||amount<1||amount>10000||
    reason.length<5||reason.length>250||
    !/^[a-zA-Z0-9-]{20,80}$/.test(requestId))
   return error('Thông tin cấp lượt không hợp lệ: 1–100 tài khoản, 1–10.000 lượt, lý do từ 5 ký tự',400);
  const placeholders=ids.map(()=>'?').join(',');
  const found=await env.DB.prepare('SELECT id FROM accounts WHERE id IN ('+placeholders+')').bind(...ids).all();
  if(found.results.length!==ids.length)return error('Có tài khoản không tồn tại. Chưa cấp lượt cho ai.',404);
  // Pre-check idempotency before batch. UNIQUE(request_id, account, feature)
  // also protects against retries with identical identifiers.
  const existing=await env.DB.prepare('SELECT account_id,feature,amount FROM bonus_credits WHERE grant_request_id=?')
    .bind(requestId).all();
  if(existing.results?.length){
   const old=existing.results;
   if(old.length===ids.length&&old.every(x=>ids.includes(x.account_id)&&x.feature===feature&&x.amount===amount))
    return send({ok:true,duplicate:true,count:ids.length,amount,feature});
   return error('Mã thao tác đã được dùng cho nội dung khác',409);
  }
  const commands=ids.flatMap(id=>[
   env.DB.prepare('INSERT INTO bonus_credits(id,grant_request_id,account_id,feature,amount,actor,reason) VALUES(?,?,?,?,?,?,?)')
    .bind(requestId+':'+id,requestId,id,feature,amount,who.id,reason),
   env.DB.prepare('INSERT INTO admin_audit(actor,action,account_id,details) VALUES(?,?,?,?)')
    .bind(who.id,'grant-bonus',id,JSON.stringify({feature,amount,reason,requestId}))
  ]);
  try{await env.DB.batch(commands);}
  catch(e){
   // Concurrent retries may see a unique constraint. Never grant twice.
   const old=await env.DB.prepare('SELECT account_id,feature,amount FROM bonus_credits WHERE grant_request_id=?').bind(requestId).all();
   if(old.results?.length===ids.length&&old.results.every(x=>ids.includes(x.account_id)&&x.feature===feature&&x.amount===amount))
    return send({ok:true,duplicate:true,count:ids.length,amount,feature});
   return error('Không cấp được lượt. Không có thay đổi nào được xác nhận.',409);
  }
  return send({ok:true,duplicate:false,count:ids.length,amount,feature});
 }
 if(path==='/api/admin/grant'&&req.method==='POST'){
  const b=await body(req),aid=String(b.accountId||''),action=String(b.action||'');
  if(!/^wp:[1-9]\d{0,12}$/.test(aid)||!['set-plan','suspend','activate'].includes(action))return error('Yêu cầu không hợp lệ');
  if(action==='set-plan'&&!['free','annual','lifetime'].includes(b.plan))return error('Gói không hợp lệ');
  if(!await env.DB.prepare('SELECT id FROM accounts WHERE id=?').bind(aid).first())return error('Không có tài khoản',404);
  const update=action==='set-plan'?
   env.DB.prepare("UPDATE accounts SET plan=?,expires_at=CASE WHEN ?='annual' THEN datetime('now','+1 year') ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.plan,b.plan,aid):
   env.DB.prepare("UPDATE accounts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(action==='suspend'?'suspended':'active',aid);
  await env.DB.batch([update,env.DB.prepare('INSERT INTO admin_audit(actor,action,account_id,details) VALUES(?,?,?,?)').bind(who.id,action,aid,JSON.stringify({plan:b.plan||null,reason:String(b.reason||'').slice(0,200)}))]);
  return send({ok:true});
 }
 return error('API quản trị không tồn tại',404);
}

// Read-only-to-entitlements SePay TEST MODE webhook receiver.
// Separate HMAC secret and D1 table; cannot create/complete WooCommerce orders or grant plans.
// Based on SePay X-SePay-Signature: sha256=<hex HMAC-SHA256(timestamp + '.' + raw_bytes)>.
async function acceptSePayTest(req,env){
 if(!env.SEPAY_TEST_WEBHOOK_SECRET || !env.SEPAY_TEST_BANK_ACCOUNT)
  return error('Cấu hình SePay Test Mode chưa hoàn tất',503);
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))
  return error('Chỉ nhận JSON',415);
 const ts=req.headers.get('X-SePay-Timestamp')||'';
 const sig=req.headers.get('X-SePay-Signature')||'';
 if(!/^\d{10,12}$/.test(ts)||Math.abs(Math.floor(Date.now()/1000)-Number(ts))>300 ||
    !/^sha256=[a-fA-F0-9]{64}$/.test(sig))
  return error('Chứng thực webhook hết hạn hoặc không hợp lệ',401);
 const len=Number(req.headers.get('content-length')||0);
 if(!Number.isFinite(len)||len>16384)return error('Dữ liệu quá lớn',413);
 const raw=new Uint8Array(await req.arrayBuffer());
 if(raw.length===0||raw.length>16384)return error('Dữ liệu trống hoặc quá lớn',413);
 const prefix=txt.encode(ts+'.'), signed=new Uint8Array(prefix.length+raw.length);
 signed.set(prefix);signed.set(raw,prefix.length);
 const signature=Uint8Array.from(sig.slice(7).match(/../g),byte=>parseInt(byte,16));
 const verified=await crypto.subtle.verify(
  'HMAC',await hmacKey(env.SEPAY_TEST_WEBHOOK_SECRET),signature,signed);
 if(!verified)return error('Chữ ký SePay không hợp lệ',401);
 let data;
 try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
 catch{return error('JSON không hợp lệ');}
 const tx=Number(data?.id),amount=Number(data?.transferAmount);
 const account=String(data?.accountNumber??''),code=String(data?.code??'');
 if(!Number.isSafeInteger(tx)||tx<1||!Number.isSafeInteger(amount)||amount<1||
    data?.transferType!=='in'||account!==String(env.SEPAY_TEST_BANK_ACCOUNT)||
    !/^DH\d{3,10}$/.test(code))
  return error('Dữ liệu không khớp giao dịch ChấmPro TEST',422);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
 const digestHex=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 const existing=await env.DB.prepare('SELECT payload_sha256 FROM sepay_test_receipts WHERE transaction_id=?').bind(tx).first();
 if(existing){
  if(existing.payload_sha256!==digestHex)return error('Mã giao dịch đã tồn tại với nội dung khác',409);
  return send({success:true,received:true,duplicate:true});
 }
 await env.DB.prepare('INSERT OR IGNORE INTO sepay_test_receipts (transaction_id,payment_code,amount_vnd,account_number,payload_sha256,signature_timestamp) VALUES (?,?,?,?,?,?)')
  .bind(tx,code,amount,account,digestHex,Number(ts)).run();
 const saved=await env.DB.prepare('SELECT payload_sha256 FROM sepay_test_receipts WHERE transaction_id=?').bind(tx).first();
 if(!saved||saved.payload_sha256!==digestHex)return error('Không ghi được biên nhận webhook',503);
 // CRITICAL: receipt only. Not a payment proof for WordPress and no paid-order action.
 return send({success:true,received:true,duplicate:false});
}

export default {
 async fetch(req,env){
  const origin=req.headers.get('Origin')||'';
  const whitelist=String(env.ALLOWED_ORIGINS||'https://champro.mrhien.com,https://mrhien.com').split(',').map(x=>x.trim());
  if(origin&&!whitelist.includes(origin))return error('Nguồn bị từ chối',403);
  const cors={'Access-Control-Allow-Origin':origin||'https://champro.mrhien.com',
   'Access-Control-Allow-Headers':'Authorization,Content-Type,X-Bridge-Secret',
   'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   if(!env.DB||!env.AUTH_HMAC_SECRET||!env.INTERNAL_BRIDGE_SECRET||!env.ADMIN_WP_USER_IDS||!env.PRODUCT_ANNUAL_ID||!env.PRODUCT_LIFETIME_ID)
    return new Response(JSON.stringify({ok:false,error:'Cấu hình máy chủ chưa hoàn tất'}),{status:503,headers:{...cors,'content-type':'application/json'}});
   const path=new URL(req.url).pathname;
   let res;
   if(path==='/health'&&req.method==='GET')res=send({ok:true,service:'champro-platform'});
   // Temporary, READ-ONLY staging diagnostic: validates D1 binding and all required tables.
   // No account data, secret, order information, or row counts are exposed.
   else if(path==='/health/db'&&req.method==='GET'){
    for(const table of ['accounts','payments','usage_events','admin_audit','bonus_credits']){
     await env.DB.prepare('SELECT 1 FROM '+table+' LIMIT 0').all();
    }
    res=send({ok:true,service:'champro-payment-test',database:'connected',tablesChecked:5});
   }
   else if(path==='/webhooks/sepay-test'&&req.method==='POST')res=await acceptSePayTest(req,env);
   else if(path==='/api/internal'&&req.method==='POST')res=await internal(req,env);
   else{
    const who=await session(req,env);
    if(path==='/api/me'&&req.method==='GET')res=await profile(env,who);
    else if(path.startsWith('/api/admin/'))res=await admin(env,who,path,req);
    else if(path.startsWith('/api/usage/')&&req.method==='POST')res=await useCredit(env,who,path.slice(11),await body(req));
    else res=error('Không tìm thấy API',404);
   }
   for(const [k,v] of Object.entries(cors))res.headers.set(k,v);
   return res;
  }catch(e){
   const res=error(e.status?e.message:'Lỗi xử lý phía máy chủ',e.status||500);
   for(const [k,v] of Object.entries(cors))res.headers.set(k,v);
   return res;
  }
 }
};
