// content.js — injects the sponsor overlay bar on any page
(function() {
  let overlayEl = null;

  function createOverlay(sponsor) {
    if (overlayEl) overlayEl.remove();

    overlayEl = document.createElement('div');
    overlayEl.id = 'myrewrd-gameday-overlay';
    overlayEl.innerHTML = `
      <div class="myrewrd-gd-inner">
        <span class="myrewrd-gd-emoji">🏈</span>
        <span class="myrewrd-gd-text">LIVE GAME SPONSORED BY</span>
        <span class="myrewrd-gd-divider"></span>
        ${sponsor.logoUrl ? `<img class="myrewrd-gd-logo" src="${sponsor.logoUrl}" alt="" />` : ''}
        <span class="myrewrd-gd-name">${sponsor.name}</span>
      </div>
    `;
    document.body.appendChild(overlayEl);
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'activate' && msg.sponsor) {
      createOverlay(msg.sponsor);
    } else if (msg.action === 'deactivate') {
      removeOverlay();
    }
  });

  // Check if overlay should be active on page load
  chrome.storage.local.get(['overlayActive', 'sponsorData'], (data) => {
    if (data.overlayActive && data.sponsorData) {
      createOverlay(data.sponsorData);
    }
  });
})();
