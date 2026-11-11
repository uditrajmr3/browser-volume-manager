/**
 * SiteVolume - Background Service Worker
 * Manages badge updates, cross-tab synchronization, and installation lifecycle.
 */

// Normalize hostname
function getDomainKey(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (e) {
    return null;
  }
}

/**
 * Update the extension icon badge for a specific tab
 */
async function updateBadge(tabId, url) {
  if (!tabId || !url || url.startsWith('chrome://') || url.startsWith('edge://')) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const domain = getDomainKey(url);
  if (!domain) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  chrome.storage.local.get(['siteVolumes', 'globalDefault'], (data) => {
    if (chrome.runtime.lastError) return;

    const siteVolumes = data.siteVolumes || {};
    const setting = siteVolumes[domain];

    if (!setting) {
      chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }

    if (setting.muted) {
      chrome.action.setBadgeText({ tabId, text: 'MUT' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' }); // Red
    } else {
      const pct = Math.round(setting.volume * 100);
      if (pct === 100) {
        chrome.action.setBadgeText({ tabId, text: '' });
      } else {
        chrome.action.setBadgeText({ tabId, text: `${pct}%` });
        chrome.action.setBadgeBackgroundColor({
          tabId,
          color: pct > 100 ? '#f59e0b' : '#3b82f6' // Amber for boost, blue for standard
        });
      }
    }
  });
}

// Tab switched
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      updateBadge(tab.id, tab.url);
    }
  } catch (e) {}
});

// Tab loaded/navigated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

// Broadcast volume update to all tabs matching domain
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BROADCAST_SITE_VOLUME') {
    const { domain, volume, muted } = message;

    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (!tab.url) continue;
        const tabDomain = getDomainKey(tab.url);
        if (tabDomain === domain) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SITE_VOLUME_UPDATE',
            domain,
            volume,
            muted
          }).catch(() => {});
          updateBadge(tab.id, tab.url);
        }
      }
    });

    sendResponse({ success: true });
    return true;
  }
});

// Initialize on install
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

