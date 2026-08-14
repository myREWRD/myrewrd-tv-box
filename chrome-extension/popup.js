// popup.js — handles the extension popup UI
document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('token');
  const activateBtn = document.getElementById('activate');
  const deactivateBtn = document.getElementById('deactivate');
  const statusEl = document.getElementById('status');
  const previewEl = document.getElementById('preview');
  const sponsorNameEl = document.getElementById('sponsor-name');

  // Load saved state
  chrome.storage.local.get(['tvToken', 'overlayActive', 'sponsorName'], (data) => {
    if (data.tvToken) tokenInput.value = data.tvToken;
    if (data.overlayActive) {
      activateBtn.style.display = 'none';
      deactivateBtn.style.display = 'block';
      statusEl.className = 'status active';
      statusEl.textContent = 'Overlay active';
      if (data.sponsorName) {
        previewEl.style.display = 'block';
        sponsorNameEl.textContent = data.sponsorName;
      }
    }
  });

  activateBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) { alert('Enter your TV token'); return; }

    // Fetch sponsor data
    try {
      const res = await fetch(`https://app.myrewrd.com/api/tv-sponsor?token=${token}`);
      const json = await res.json();
      
      if (!json.ok || !json.found || !json.sponsor) {
        alert('No active sponsor found for this token. Check your TV token.');
        return;
      }

      const sponsorData = {
        name: json.sponsor.name,
        logoUrl: json.sponsor.logo_url_tv || json.sponsor.logo_url || null,
        message: json.sponsor.sponsor_message || null,
      };

      // Save state and activate
      chrome.storage.local.set({
        tvToken: token,
        overlayActive: true,
        sponsorName: sponsorData.name,
        sponsorData: sponsorData,
      });

      // Send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'activate', sponsor: sponsorData });
        }
      });

      activateBtn.style.display = 'none';
      deactivateBtn.style.display = 'block';
      statusEl.className = 'status active';
      statusEl.textContent = 'Overlay active';
      previewEl.style.display = 'block';
      sponsorNameEl.textContent = sponsorData.name;
    } catch (e) {
      alert('Failed to fetch sponsor data. Check your connection.');
    }
  });

  deactivateBtn.addEventListener('click', () => {
    chrome.storage.local.set({ overlayActive: false });
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'deactivate' });
      }
    });

    activateBtn.style.display = 'block';
    deactivateBtn.style.display = 'none';
    statusEl.className = 'status inactive';
    statusEl.textContent = 'Overlay inactive';
    previewEl.style.display = 'none';
  });
});
