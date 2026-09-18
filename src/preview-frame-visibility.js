// Executed only in the provider's isolated world. Returns geometry facts, never
// URLs, field values or DOM text. Unknown/closed-shadow owners are not excluded.
const hiddenChildFramesCode = `(() => {
  const owners = [];
  let opaque = false;
  const visit = root => {
    for (const element of root.querySelectorAll('*')) {
      if (element.matches('object,embed')) opaque = true;
      if (element.matches('iframe,frame')) owners.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document);
  const count = window.frames.length;
  if (opaque || count > 50) return { hidden: false, count };
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const matches = owners.filter(element => element.isConnected && element.contentWindow === window.frames[i]);
    if (matches.length !== 1 || used.has(matches[0])) return { hidden: false, count };
    const owner = matches[0]; used.add(owner);
    if ([...owner.getClientRects()].some(rect => !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || (rect.width > 0 && rect.height > 0))) return { hidden: false, count };
  }
  return { hidden: true, count };
})()`;
module.exports = { hiddenChildFramesCode };
