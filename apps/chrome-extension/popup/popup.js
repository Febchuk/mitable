"use strict";
(() => {
  var o = document.getElementById("statusDot"),
    n = document.getElementById("statusText"),
    t = document.getElementById("reconnectBtn");
  function s(e) {
    e
      ? ((o.className = "status-dot connected"),
        (n.textContent = "Connected to Mitable"),
        (t.style.display = "none"))
      : ((o.className = "status-dot disconnected"),
        (n.textContent = "Disconnected"),
        (t.style.display = "block"));
  }
  chrome.storage.local.get("bridgeConnected", (e) => {
    s(e.bridgeConnected === !0);
  });
  chrome.storage.onChanged.addListener((e) => {
    e.bridgeConnected && s(e.bridgeConnected.newValue === !0);
  });
  t.addEventListener("click", () => {
    (chrome.runtime.sendMessage({ action: "reconnect" }),
      (n.textContent = "Connecting..."),
      (t.style.display = "none"));
  });
})();
