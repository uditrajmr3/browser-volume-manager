/**
 * SiteVolume - Content Script Bridge (ISOLATED world)
 * Bridges chrome.storage/extension messages with inject.js in MAIN world
 */

(function () {
  'use strict';

  function getDomainKey(hostname) {
    if (!hostname) return 'default';
    return hostname.replace(/^www\./i, '').toLowerCase();
  }

  const currentHost = location.hostname;
  const domainKey = getDomainKey(currentHost);

  let currentSettings = {
    volume: 1.0,
    muted: false
  };

  /**
   * Post settings to inject.js in the MAIN world via window.postMessage
   */
  function dispatchToPage(settings) {
    window.postMessage({
      source: 'SITE_VOLUME_BRIDGE',
      type: 'APPLY_SETTINGS',
      volume: settings.volume,
      muted: settings.muted
    }, '*');
  }

  /**
   * Load saved settings from chrome.storage
   */
  function loadAndApplySettings() {
    if (!chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(['siteVolumes', 'globalDefault'], (result) => {
      if (chrome.runtime.lastError) return;

      const siteVolumes = result.siteVolumes || {};
      const globalDefault = typeof result.globalDefault === 'number' ? result.globalDefault : 1.0;

      if (siteVolumes[domainKey]) {
        currentSettings = {
          volume: siteVolumes[domainKey].volume ?? 1.0,
          muted: siteVolumes[domainKey].muted ?? false
        };
      } else {
        currentSettings = {
          volume: globalDefault,
          muted: false
        };
      }

      dispatchToPage(currentSettings);
    });
  }

  // Load right away
  loadAndApplySettings();

  // Listen for inject.js ready message
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.source === 'SITE_VOLUME_INJECT') {
      if (event.data.type === 'READY') {
        dispatchToPage(currentSettings);
      }
    }
  });

  // Listen for direct messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SITE_VOLUME_UPDATE') {
      currentSettings.volume = message.volume;
      currentSettings.muted = message.muted;
      dispatchToPage(currentSettings);
      sendResponse({ success: true });
    } else if (message.type === 'SITE_VOLUME_GET_CURRENT') {
      sendResponse({
        domain: domainKey,
        settings: currentSettings
      });
    }
    return true;
  });
})();
