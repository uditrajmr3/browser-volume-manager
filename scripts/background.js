/**
 * SiteVolume - Background Service Worker
 * Manages offscreen audio capture, badge updates, and persistent domain settings.
 */

const capturedTabs = new Set();

function getDomainKey(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (e) {
    return null;
  }
}

// Ensure the offscreen document is created and running
async function ensureOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;
  }

  if (chrome.runtime.getContexts) {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existing.length > 0) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Real-time tab audio volume control'
    });
  } catch (err) {
    if (!err.message.includes('Only a single offscreen document may be created')) {
      console.error('[SiteVolume] Failed to create offscreen doc:', err);
    }
  }
}

/**
 * Capture tab audio and set volume via Offscreen Document
 */
async function captureAndSetVolume(tabId, volume, muted) {
  if (capturedTabs.has(tabId)) {
    // Already capturing, just update volume
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'SET_VOLUME',
      tabId,
      volume,
      muted
    }).catch(() => {});
    return;
  }

  // Ensure offscreen document is ready
  await ensureOffscreenDocument();

  // Get streamId for target tab
  chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
    if (chrome.runtime.lastError || !streamId) {
      console.warn('[SiteVolume] getMediaStreamId failed:', chrome.runtime.lastError);
      return;
    }

    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'START_CAPTURE',
      tabId,
      streamId,
      volume,
      muted
    }, (response) => {
      if (response && response.success) {
        capturedTabs.add(tabId);
      }
    });
  });
}

/**
 * Update the extension icon badge for a tab
 */
function updateBadge(tabId, volume, muted) {
  if (!tabId) return;

  if (muted) {
    chrome.action.setBadgeText({ tabId, text: 'MUT' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
  } else {
    const pct = Math.round(volume * 100);
    if (pct === 100) {
      chrome.action.setBadgeText({ tabId, text: '' });
    } else {
      chrome.action.setBadgeText({ tabId, text: `${pct}%` });
      chrome.action.setBadgeBackgroundColor({
        tabId,
        color: pct > 100 ? '#f59e0b' : '#3b82f6'
      });
    }
  }
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (capturedTabs.has(tabId)) {
    capturedTabs.delete(tabId);
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'STOP_CAPTURE',
      tabId
    }).catch(() => {});
  }
});

// Update badge when switching tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab || !tab.url) return;

    const domain = getDomainKey(tab.url);
    if (!domain) return;

    chrome.storage.local.get(['siteVolumes', 'globalDefault'], (data) => {
      const siteVolumes = data.siteVolumes || {};
      const setting = siteVolumes[domain];
      if (setting) {
        updateBadge(tab.id, setting.volume, setting.muted);
      } else {
        chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      }
    });
  } catch (e) {}
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_TAB_VOLUME') {
    const { tabId, domain, volume, muted } = message;

    // Apply capture & volume to active tab
    captureAndSetVolume(tabId, volume, muted);
    updateBadge(tabId, volume, muted);

    // Save domain settings
    chrome.storage.local.get(['siteVolumes'], (data) => {
      const siteVolumes = data.siteVolumes || {};
      siteVolumes[domain] = {
        volume,
        muted,
        updatedAt: Date.now()
      };
      chrome.storage.local.set({ siteVolumes });
    });

    // Also update any other open tabs for this domain
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (t.id !== tabId && t.url && getDomainKey(t.url) === domain) {
          if (capturedTabs.has(t.id)) {
            captureAndSetVolume(t.id, volume, muted);
          }
          updateBadge(t.id, volume, muted);
        }
      }
    });

    sendResponse({ success: true });
    return true;
  }
});

// Initialize storage defaults on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['siteVolumes', 'globalDefault'], (data) => {
    if (!data.siteVolumes) {
      chrome.storage.local.set({ siteVolumes: {} });
    }
    if (data.globalDefault === undefined) {
      chrome.storage.local.set({ globalDefault: 1.0 });
    }
  });
});
