// Attended private setup policy is separate from saved-password delivery.
// Prime supports only the first-party route chain observed in the isolated
// Windows Electron lab. Unobserved challenges fail closed.
const {allowedLoginUrl,playbackReturn,HULU_LOGIN,PEACOCK_LOGIN}=require('./provider-account-login');
const PRIME_HOME='https://www.primevideo.com/';
function primeDocument(value,origin,paths) {
  try {
    if(typeof value!=='string')return false;
    const raw=/^https:\/\/([^/?#]+)([^?#]*)/.exec(value),u=new URL(value);
    return Boolean(raw&&!u.username&&!u.password&&!u.port&&u.origin===origin&&raw[1]===u.hostname&&(raw[2]||'/')===u.pathname&&paths.some(path=>typeof path==='string'?path===u.pathname:path.test(u.pathname)));
  }catch{return false;}
}
const primeEntry=value=>primeDocument(value,'https://www.primevideo.com',['/']);
const primeReturn=value=>primeDocument(value,'https://na.primevideo.com',['/ap/return','/auth/return'])||primeDocument(value,'https://www.primevideo.com',['/region/na/auth/return']);
const primeHomeReturn=value=>primeDocument(value,'https://www.primevideo.com',['/region/na/']);
function privateInteractive(value,provider) {
  return provider==='prime-video'?primeDocument(value,'https://www.amazon.com',['/ap/signin','/ap/mfa',/^\/ap\/signin\/\d{3}-\d{7}-\d{7}$/]):allowedLoginUrl(value,provider);
}
function privateNavigation(value,provider) {
  return provider==='prime-video'?(primeEntry(value)||privateInteractive(value,provider)||primeReturn(value)||primeHomeReturn(value)||primeDocument(value,'https://www.primevideo.com',['/auth-redirect'])):allowedLoginUrl(value,provider)||playbackReturn(value,provider);
}
const privateStart=provider=>provider==='prime-video'?PRIME_HOME:provider==='peacock'?PEACOCK_LOGIN:HULU_LOGIN;
module.exports={privateStart,privateInteractive,privateNavigation,primeEntry,primeReturn,primeHomeReturn};
