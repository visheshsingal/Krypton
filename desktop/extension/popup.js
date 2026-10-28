const form = document.getElementById('pair-form');
const input = document.getElementById('pairing-code');
const button = document.getElementById('activate-button');
const accountForm = document.getElementById('account-form');
const accountButton = document.getElementById('account-activate-button');
const disconnectButton = document.getElementById('disconnect-button');
const passwordInput = document.getElementById('account-password');
const showPassword = document.getElementById('show-password');
const status = document.getElementById('protection-status');
const browserPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
const isMacBrowser = /mac/i.test(browserPlatform) || /Macintosh|Mac OS X/i.test(navigator.userAgent);

function showState(state) {
  status.className = state.authorized ? 'active' : '';
  if (state.authorized) {
    status.textContent = `Protection active${state.status === 'offline' ? ' (offline grace)' : ''}.`;
    form.hidden = true;
    accountForm.hidden = true;
    disconnectButton.hidden = false;
  } else if (state.status === 'license_invalid' || state.status === 'revoked') {
    status.textContent = isMacBrowser
      ? 'License invalid or browser access revoked. Sign in again to activate this browser.'
      : 'License invalid or device revoked. Sign in again in Krypton Desktop and generate a new code.';
    form.hidden = isMacBrowser;
    accountForm.hidden = !isMacBrowser;
    disconnectButton.hidden = !isMacBrowser || !state.canDisconnect;
  } else {
    status.textContent = isMacBrowser
      ? 'Sign in with your company license to activate browser protection.'
      : 'Not connected. Activate using Krypton Desktop.';
    form.hidden = isMacBrowser;
    accountForm.hidden = !isMacBrowser;
    disconnectButton.hidden = !isMacBrowser || !state.canDisconnect;
  }
}

chrome.runtime.sendMessage({ type: 'REFRESH_STATUS' }, showState);

showPassword.addEventListener('change', () => {
  passwordInput.type = showPassword.checked ? 'text' : 'password';
});

accountForm.addEventListener('submit', (event) => {
  event.preventDefault();
  accountButton.disabled = true;
  status.className = '';
  status.textContent = 'Checking account and license…';
  chrome.runtime.sendMessage(
    {
      type: 'ACTIVATE_BROWSER_ONLY',
      licenseKey: document.getElementById('license-key').value.trim(),
      email: document.getElementById('account-email').value.trim(),
      password: document.getElementById('account-password').value,
    },
    (result) => {
      accountButton.disabled = false;
      if (chrome.runtime.lastError || !result?.success) {
        status.className = 'error';
        status.textContent = result?.error || chrome.runtime.lastError?.message || 'Activation failed.';
        return;
      }
      accountForm.reset();
      passwordInput.type = 'password';
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

disconnectButton.addEventListener('click', () => {
  disconnectButton.disabled = true;
  chrome.runtime.sendMessage({ type: 'DISCONNECT_BROWSER' }, (result) => {
    disconnectButton.disabled = false;
    if (chrome.runtime.lastError || !result?.success) {
      status.className = 'error';
      status.textContent = result?.error || chrome.runtime.lastError?.message || 'Could not disconnect.';
      return;
    }
    showState({ authorized: false, status: 'not_installed' });
  });
});
