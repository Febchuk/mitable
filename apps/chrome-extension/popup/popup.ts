const statusDot = document.getElementById("statusDot")!;
const statusText = document.getElementById("statusText")!;
const reconnectBtn = document.getElementById("reconnectBtn")! as HTMLButtonElement;

function updateUI(connected: boolean): void {
  if (connected) {
    statusDot.className = "status-dot connected";
    statusText.textContent = "Connected to Mitable";
    reconnectBtn.style.display = "none";
  } else {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Disconnected";
    reconnectBtn.style.display = "block";
  }
}

// Check current state from storage
chrome.storage.local.get("bridgeConnected", (result) => {
  updateUI(result.bridgeConnected === true);
});

// Listen for state changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.bridgeConnected) {
    updateUI(changes.bridgeConnected.newValue === true);
  }
});

// Reconnect button
reconnectBtn.addEventListener("click", () => {
  // Send message to service worker to reconnect
  chrome.runtime.sendMessage({ action: "reconnect" });
  statusText.textContent = "Connecting...";
  reconnectBtn.style.display = "none";
});
