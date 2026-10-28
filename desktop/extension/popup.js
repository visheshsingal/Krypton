const form = document.getElementById('pair-form');
const input = document.getElementById('pairing-code');
const button = document.getElementById('activate-button');
const accountForm = document.getElementById('account-form');
const accountButton = document.getElementById('account-activate-button');
const status = document.getElementById('protection-status');
const browserPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
const isMacBrowser = /mac/i.test(browserPlatform) || /Macintosh|Mac OS X/i.test(navigator.userAgent);

function showState(state) {
  status.className = state.authorized ? 'active' : '';
  if (state.authorized) {
    status.textContent = `Protection active${state.status === 'offline' ? ' (offline grace)' : ''}.`;
    form.hidden = true;
    accountForm.hidden = true;
  } else if (state.status === 'license_invalid' || state.status === 'revoked') {
    status.textContent = isMacBrowser
      ? 'License invalid or browser disabled. Contact your company administrator.'
      : 'License invalid or device revoked. Sign in again in Krypton Desktop and generate a new code.';
    form.hidden = isMacBrowser;
    accountForm.hidden = !isMacBrowser;
  } else {
    status.textContent = isMacBrowser
      ? 'Enter your company license key to register this browser.'
      : 'Not connected. Activate using Krypton Desktop.';
    form.hidden = isMacBrowser;
    accountForm.hidden = !isMacBrowser;
  }
}

chrome.runtime.sendMessage({ type: 'REFRESH_STATUS' }, showState);

accountForm.addEventListener('submit', (event) => {
  event.preventDefault();
  accountButton.disabled = true;
  status.className = '';
  status.textContent = 'Checking company license…';
  chrome.runtime.sendMessage(
    {
      type: 'ACTIVATE_BROWSER_ONLY',
      licenseKey: document.getElementById('license-key').value.trim(),
    },
    (result) => {
      accountButton.disabled = false;
      if (chrome.runtime.lastError || !result?.success) {
        status.className = 'error';
        status.textContent = result?.error || chrome.runtime.lastError?.message || 'Activation failed.';
        return;
      }
      showState({ authorized: true, status: 'protection_active' });
    },
  );
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  button.disabled = true;
  status.className = '';
  status.textContent = 'Activating securely…';
  chrome.runtime.sendMessage(
    { type: 'PAIR_EXTENSION', pairingCode: input.value.trim() },
    (result) => {
      button.disabled = false;
      if (chrome.runtime.lastError || !result?.success) {
        status.className = 'error';
        status.textContent = result?.error || chrome.runtime.lastError?.message || 'Activation failed.';
        return;
      }
      input.value = '';
      showState({ authorized: true, status: 'protection_active' });
    },
  );
});
