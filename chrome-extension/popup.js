document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.getElementById("token");
  const saveBtn = document.getElementById("save");
  const statusEl = document.getElementById("status");
  const modeEl = document.getElementById("mode");

  chrome.storage.local.get(["tvToken", "currentMode", "sponsorName"], (data) => {
    if (data.tvToken) {
      tokenInput.value = data.tvToken;
      showConnected(data.currentMode, data.sponsorName);
    }
  });

  saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    if (!token) { alert("Enter your TV token"); return; }
    try {
      const res = await fetch(`https://app.myrewrd.com/api/tv-box-command?token=${token}`);
      if (!res.ok) { alert("Invalid token."); return; }
      const data = await res.json();
      await chrome.storage.local.set({ tvToken: token });
      showConnected(data.mode, data.sponsor_name);
    } catch (e) { alert("Connection failed."); }
  });

  function showConnected(mode, sponsorName) {
    statusEl.style.display = "block";
    statusEl.className = "status connected";
    statusEl.textContent = "Connected — auto-polling every 5s";
    if (mode) {
      const cls = mode === "gameday" ? "mode-gameday" : mode === "stream" ? "mode-stream" : "mode-regular";
      const label = mode === "gameday" ? "Game Day" : mode === "stream" ? "Live Stream" : "Regular";
      modeEl.innerHTML = `<span class="mode-badge ${cls}">${label}</span>`;
      if (sponsorName && mode === "gameday") {
        modeEl.innerHTML += `<p style="font-size:11px;color:#64748b;margin-top:4px">Sponsor: ${sponsorName}</p>`;
      }
    }
  }
});
