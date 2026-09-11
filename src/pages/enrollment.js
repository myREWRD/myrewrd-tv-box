const params = new URLSearchParams(location.search);
const code = params.get('code') || '';
const expires = Date.parse(params.get('expires') || '');
function showCode() {
  const active = /^[A-F0-9]{12}$/.test(code) && expires > Date.now();
  document.getElementById('code').textContent = active ? code.match(/.{4}/g).join(' – ') : 'Setup expired';
  if (!active) document.getElementById('expiry').textContent = 'Start receiver setup again from TV Devices.';
}
showCode(); setInterval(showCode, 1000);
