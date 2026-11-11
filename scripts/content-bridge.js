/**
 * SiteVolume - Content Script Bridge (ISOLATED world)
 * Bridges communication between chrome.storage/extension messages
 * and the MAIN world injected audio controller script.
 */

(function () {
  'use strict';

  // Normalize hostname (e.g. www.chess.com -> chess.com)
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
   * Send settings to the injected script in the MAIN world
   */
  function dispatchToPage(settings) {
    window.dispatchEvent(
      new CustomEvent('__SITE_VOLUME_APPLY__', {
        detail: {
          volume: settings.volume,
          muted: settings.muted
        }
      })
    );
  }

  /**
   * Load stored settings for the current site
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

  // If inject.js signals it just mounted, re-dispatch
  window.addEventListener('__SITE_VOLUME_READY__', () => {
    dispatchToPage(currentSettings);
  });

  // Listen for real-time messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SITE_VOLUME_UPDATE') {
      if (message.domain === domainKey || message.domain === currentHost) {
        currentSettings.volume = message.volume;
        currentSettings.muted = message.muted;
        dispatchToPage(currentSettings);
        sendResponse({ success: true });
      }
    } else if (message.type === 'SITE_VOLUME_GET_CURRENT') {
      sendResponse({
        domain: domainKey,
        settings: currentSettings
      });
    }
    return true;
  });
})();

