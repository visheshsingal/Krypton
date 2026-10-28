const API_BASE = 'https://krypton-ten-theta.vercel.app/api/desktop/extension';
const HEARTBEAT_ALARM = 'krypton-extension-heartbeat';

async function getState() {
  const state = await chrome.storage.local.get([
    'sessionToken',
    'sessionExpiresAt',
    'offlineGraceHours',
    'policy',
    'authorized',
    'lastValidatedAt',
    'status',
  ]);
  return {
    sessionToken: state.sessionToken || '',
    sessionExpiresAt: state.sessionExpiresAt || '',
    offlineGraceHours: state.offlineGraceHours || 72,
    policy: state.policy || null,
    authorized: state.authorized === true,
    lastValidatedAt: state.lastValidatedAt || 0,
    status: state.status || 'not_installed',
  };
}

async function updateState(values) {
  await chrome.storage.local.set(values);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { type: 'STATE_CHANGED' }).catch(() => undefined);
    }
  }
}

async function callApi(path, token, body) {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Krypton could not validate the extension.');
    error.status = response.status;
    error.code = data.status;
    throw error;
  }
  return data;
}

async function heartbeat() {
  const state = await getState();
  if (!state.sessionToken) return { status: 'not_installed', authorized: false };
  try {
    const data = await callApi('session', state.sessionToken);
    await updateState({
      authorized: data.protectionActive === true,
      status: data.status,
      policy: data.policy || state.policy,
      lastValidatedAt: Date.now(),
    });
    return { status: data.status, authorized: data.protectionActive === true };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      await updateState({ authorized: false, status: error.code || 'license_invalid' });
      return { status: error.code || 'license_invalid', authorized: false };
    }
    const inOfflineGrace = state.lastValidatedAt > 0 &&
      Date.now() - state.lastValidatedAt <= Math.min(state.offlineGraceHours, 720) * 60 * 60 * 1000 &&
      Date.parse(state.sessionExpiresAt) > Date.now();
    await updateState({
      authorized: inOfflineGrace && Boolean(state.policy),
      status: inOfflineGrace ? 'offline' : 'license_invalid',
    });
    return { status: inOfflineGrace ? 'offline' : 'license_invalid', authorized: inOfflineGrace };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInstallationId();
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 5 });
});

async function ensureInstallationId() {
  const { installationId } = await chrome.storage.local.get('installationId');
  if (typeof installationId === 'string' && /^[0-9a-f-]{36}$/i.test(installationId)) return installationId;
  const newInstallationId = crypto.randomUUID();
  await chrome.storage.local.set({ installationId: newInstallationId });
  return newInstallationId;
}

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 5 });
  void heartbeat();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) void heartbeat();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_STATE') {
    void getState().then((state) => sendResponse({
      authorized: state.authorized,
      status: state.status,
      policy: state.policy,
    }));
    return true;
  }

  if (message?.type === 'PAIR_EXTENSION') {
    if (sender.url !== chrome.runtime.getURL('popup.html')) return false;
    void (async () => {
      const installationId = await ensureInstallationId();
      const data = await callApi('activate', '', {
        pairingCode: message.pairingCode,
        installationId,
        browser: navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome',
      });
      await chrome.storage.local.set({
        sessionToken: data.sessionToken,
        sessionExpiresAt: data.expiresAt,
        offlineGraceHours: data.offlineGraceHours,
        policy: data.policy || null,
        authorized: true,
        status: 'protection_active',
        lastValidatedAt: Date.now(),
      });
      const checked = await heartbeat();
      sendResponse({
        success: checked.authorized,
        status: checked.status,
        error: checked.authorized ? undefined : 'The license could not be validated after activation.',
      });
    })().catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.type === 'REFRESH_STATUS') {
    void heartbeat().then(sendResponse);
    return true;
  }

  if (message?.type === 'BLOCKED_EVENT') {
    const siteHost = sender.tab?.url ? new URL(sender.tab.url).hostname : '';
    const event = message.event || {};
    if (
      !sender.tab?.url ||
      sender.frameId !== 0 ||
      siteHost !== event.hostname ||
      typeof event.ruleCode !== 'string' ||
      typeof event.ruleName !== 'string'
    ) {
      sendResponse({ accepted: false });
      return false;
    }
    void (async () => {
      const state = await getState();
      if (!state.authorized || !state.sessionToken) {
        sendResponse({ accepted: false });
        return;
      }
      await callApi('events', state.sessionToken, {
        hostname: siteHost,
        riskLevel: event.riskLevel,
        actionTaken: event.actionTaken,
        ruleCode: event.ruleCode,
        ruleName: event.ruleName,
        category: event.category,
        explanation: event.explanation,
      });
      sendResponse({ accepted: true });
    })().catch((error) => {
      console.error('[Krypton Extension] Could not submit sanitized block event:', error);
      sendResponse({ accepted: false });
    });
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => void heartbeat());
