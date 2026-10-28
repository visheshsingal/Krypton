const form = document.getElementById('pair-form');
const input = document.getElementById('pairing-code');
const button = document.getElementById('activate-button');
const status = document.getElementById('protection-status');

function showState(state) {
  status.className = state.authorized ? 'active' : '';
  if (state.authorized) {
    status.textContent = `Protection active${state.status === 'offline' ? ' (offline grace)' : ''}.`;
    form.hidden = true;
  } else if (state.status === 'license_invalid' || state.status === 'revoked') {
    status.textContent = 'License invalid or device revoked. Sign in again in Krypton Desktop and generate a new code.';
    form.hidden = false;
  } else {
    status.textContent = 'Not connected. Activate using Krypton Desktop.';
    form.hidden = false;
  }
}

chrome.runtime.sendMessage({ type: 'REFRESH_STATUS' }, showState);

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
