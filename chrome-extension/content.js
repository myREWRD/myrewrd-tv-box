// content.js — Injects and manages the sponsor overlay bar
(function () {
  let overlayEl = null;

  function createOverlay(sponsor) {
    if (overlayEl) overlayEl.remove();
    overlayEl = document.createElement("div");
    overlayEl.id = "myrewrd-gameday-overlay";
    overlayEl.innerHTML = `
      <div class="myrewrd-gd-inner">
        <span class="myrewrd-gd-emoji">🏈</span>
        <span class="myrewrd-gd-text">${sponsor.text || "LIVE GAME SPONSORED BY"}</span>
        <span class="myrewrd-gd-divider"></span>
        ${sponsor.logoUrl ? `<img class="myrewrd-gd-logo" src="${sponsor.logoUrl}" alt="" />` : ""}
        <span class="myrewrd-gd-name">${sponsor.name || ""}</span>
      </div>
    `;
    document.body.appendChild(overlayEl);
  }

  function removeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  }

  // Listen for messages from background service worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "activate" && msg.sponsor) {
      createOverlay(msg.sponsor);
    } else if (msg.action === "deactivate") {
      removeOverlay();
    }
  });

  // Check stored state on page load
  chrome.storage.local.get(["showOverlay", "overlayText", "sponsorName", "sponsorLogo", "currentMode"], (data) => {
    if (data.showOverlay && data.currentMode === "gameday") {
      createOverlay({
        name: data.sponsorName || "",
        logoUrl: data.sponsorLogo || "",
        text: data.overlayText || "LIVE GAME SPONSORED BY",
      });
    }
  });
})();
