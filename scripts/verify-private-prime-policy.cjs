const assert=require('node:assert/strict');
const {privateStart,privateInteractive,privateNavigation,primeEntry,primeReturn,primeHomeReturn}=require('../src/private-signin-policy');
assert.equal(privateStart('prime-video'),'https://www.primevideo.com/');
for(const url of ['https://www.amazon.com/ap/signin','https://www.amazon.com/ap/signin?provider_context=fixture','https://www.amazon.com/ap/signin/111-1234567-1234567','https://www.amazon.com/ap/mfa','https://www.amazon.com/ap/mfa?fixture=synthetic'])assert.equal(privateInteractive(url,'prime-video'),true);
for(const url of ['https://www.amazon.com/ap/mfa/','https://www.amazon.com/ap/mfa/settings','https://www.amazon.com/ap/%6dfa','https://www.amazon.com/ap/./mfa','https://www.amazon.com:443/ap/mfa','https://user@www.amazon.com/ap/mfa','https://www.amazon.com.evil.invalid/ap/mfa','https://www.amazon.com/ap/signin/111-1234567-1234567/','https://www.amazon.com/ap/signin/arbitrary'])assert.equal(privateInteractive(url,'prime-video'),false,url);
for(const url of ['https://www.primevideo.com/','https://www.primevideo.com/auth-redirect','https://na.primevideo.com/ap/return','https://na.primevideo.com/auth/return','https://www.primevideo.com/region/na/auth/return','https://www.primevideo.com/region/na/']){
  assert.equal(privateNavigation(url,'prime-video'),true);
  assert.equal(privateInteractive(url,'prime-video'),false,'entry/return never permit capture or general input');
}
for(const url of ['http://www.amazon.com/ap/signin','https://www.amazon.com:443/ap/signin','https://www.amazon.com:444/ap/signin','https://user@www.amazon.com/ap/signin','https://www.amazon.com.evil.invalid/ap/signin','https://amazon.com/ap/signin','https://www.amazon.com/ap/./signin','https://www.amazon.com/ap/x/../signin','https://www.amazon.com/ap/%73ignin','https://www.amazon.com/ap/signin/','https://www.amazon.com/ap/challenge','https://www.amazon.com/ap/cvf','https://www.amazon.com/ap/forgotpassword','https://www.amazon.com/gp/buy','https://www.primevideo.com/detail/fixture','https://www.primevideo.com/region/eu/','https://evil.invalid/']){
  assert.equal(privateNavigation(url,'prime-video'),false,url);
  assert.equal(privateInteractive(url,'prime-video'),false,url);
}
assert.equal(primeEntry('https://www.primevideo.com/'),true);
assert.equal(primeReturn('https://www.primevideo.com/region/na/'),false,'landing alone is not an auth return');
assert.equal(primeHomeReturn('https://www.primevideo.com/'),false,'signed-out entry is not completion');
assert.equal(privateInteractive('https://auth.hulu.com/web/login/enter-email','hulu'),true);
assert.equal(privateInteractive('https://www.peacocktv.com/signin','peacock'),true);
assert.equal(privateInteractive('https://www.amazon.com/ap/signin','hulu'),false);
assert.equal(privateInteractive('https://auth.hulu.com/web/login/enter-email','prime-video'),false);
console.log('PASS bounded Prime policy: exact observed routes; entry/return input exclusion; userinfo/port/host/path/challenge/purchase denials; existing provider separation. Prototype only; no provider or device acceptance.');
