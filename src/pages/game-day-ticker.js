/* Public venue messages only; always insert as text, never HTML. */
let tickerSignature = "";
const tickerObservers = [];
function applyTicker(messages) {
  const signature = JSON.stringify(messages);
  if (signature === tickerSignature) return;
  tickerSignature = signature;
  tickerObservers.splice(0).forEach(observer => observer.disconnect());
  for (const id of ["tickerLeft", "tickerRight"]) {
    const lane = document.getElementById(id);
    lane.replaceChildren();
    if (!messages.length) continue;
    const track = document.createElement("div"); track.className = "gd-track";
    for (let copy=0; copy<2; copy++) {
      const group=document.createElement("div"); group.className="gd-group";
      if(copy) group.setAttribute("aria-hidden","true");
      for(const message of messages) {
        const item=document.createElement("span"); item.className="gd-message";
        item.textContent=message.message; group.append(item);
      }
      track.append(group);
    }
    lane.append(track);
    const measure=()=>{
      lane.style.setProperty("--gd-lane-width",`${lane.clientWidth}px`);
      lane.style.setProperty("--gd-duration",`${Math.max(15,track.firstElementChild.scrollWidth/(innerHeight*.03))}s`);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(lane);observer.observe(track.firstElementChild);tickerObservers.push(observer);measure();
  }
}
window.tvBox.getTicker().then(applyTicker).catch(()=>applyTicker([]));
window.tvBox.onTickerUpdate(applyTicker);
