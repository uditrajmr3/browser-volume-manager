/**
 * SiteVolume - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const mainView = document.getElementById('mainView');
  const restrictedView = document.getElementById('restrictedView');
  const siteDomainEl = document.getElementById('siteDomain');
  const siteFaviconEl = document.getElementById('siteFavicon');
  const siteFallbackIconEl = document.getElementById('siteFallbackIcon');
  const siteStatusBadgeEl = document.getElementById('siteStatusBadge');
  const volumePercentageEl = document.getElementById('volumePercentage');
  const volumeLabelEl = document.getElementById('volumeLabel');
  const volumeSliderEl = document.getElementById('volumeSlider');
  const btnMute = document.getElementById('btnMute');
  const muteBtnText = document.getElementById('muteBtnText');
  const chkRemember = document.getElementById('chkRemember');
  const chkBoost = document.getElementById('chkBoost');
  const btnReset = document.getElementById('btnReset');
  const btnOptions = document.getElementById('btnOptions');
  const presetButtons = document.querySelectorAll('.preset-btn[data-volume]');

  let activeTab = null;
  let currentDomain = null;
  let currentVolume = 1.0;
  let isMuted = false;
  let previousVolume = 1.0;
  let hasCustomSetting = false;

  function getDomainKey(url) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname || parsed.protocol.startsWith('chrome') || parsed.protocol.startsWith('edge') || parsed.protocol === 'about:') {
        return null;
      }
      return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function updateSliderBackground(val, max) {
    const percent = Math.min(100, Math.max(0, (val / max) * 100));
    const activeColor = val > 100 ? '#f59e0b' : '#3b82f6';
    volumeSliderEl.style.background = `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${percent}%, #33394a ${percent}%, #33394a 100%)`;
  }

  function renderUI() {
    const displayVal = Math.round(currentVolume * 100);
    const maxVal = parseInt(volumeSliderEl.max, 10);

    volumeSliderEl.value = displayVal;
    updateSliderBackground(displayVal, maxVal);

    if (isMuted) {
      volumePercentageEl.textContent = 'MUTED';
      volumePercentageEl.className = 'volume-number muted-text';
      volumeLabelEl.textContent = 'Audio Silenced';
      siteStatusBadgeEl.textContent = 'Muted';
      siteStatusBadgeEl.className = 'status-badge muted-badge';
      btnMute.classList.add('is-muted');
      muteBtnText.textContent = 'Unmute';
    } else {
      volumePercentageEl.textContent = `${displayVal}%`;
      btnMute.classList.remove('is-muted');
      muteBtnText.textContent = 'Mute';

      if (displayVal > 100) {
        volumePercentageEl.className = 'volume-number boosted';
        volumeLabelEl.textContent = 'Audio Boosted';
      } else {
        volumePercentageEl.className = 'volume-number';
        volumeLabelEl.textContent = displayVal === 100 ? 'Normal' : (displayVal < 40 ? 'Quiet' : 'Moderate');
      }

      if (hasCustomSetting) {
        siteStatusBadgeEl.textContent = 'Saved Site';
        siteStatusBadgeEl.className = 'status-badge custom';
      } else {
        siteStatusBadgeEl.textContent = 'Default';
        siteStatusBadgeEl.className = 'status-badge';
      }
    }

    presetButtons.forEach((btn) => {
      const v = parseInt(btn.dataset.volume, 10);
      if (!isMuted && v === displayVal) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function applyVolume(volume, muted, autoSave = true) {
    currentVolume = volume;
    isMuted = muted;

    if (volume > 0) {
      previousVolume = volume;
    }

    if (autoSave && chkRemember.checked && currentDomain) {
      hasCustomSetting = true;
    }

    // Send to background service worker to capture tab and scale volume
    if (activeTab && activeTab.id && currentDomain) {
      chrome.runtime.sendMessage({
        type: 'SET_TAB_VOLUME',
        tabId: activeTab.id,
        domain: currentDomain,
        volume: currentVolume,
        muted: isMuted
      });
    }

    renderUI();
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];

    if (!activeTab || !activeTab.url) {
      showRestricted();
      return;
    }

    currentDomain = getDomainKey(activeTab.url);

    if (!currentDomain) {
      showRestricted();
      return;
    }

    siteDomainEl.textContent = currentDomain;

    if (activeTab.favIconUrl && !activeTab.favIconUrl.startsWith('chrome://')) {
      siteFaviconEl.src = activeTab.favIconUrl;
      siteFaviconEl.style.display = 'block';
      siteFallbackIconEl.style.display = 'none';
      siteFaviconEl.onerror = () => {
        siteFaviconEl.style.display = 'none';
        siteFallbackIconEl.style.display = 'block';
      };
    }

    // Load saved settings
    chrome.storage.local.get(['siteVolumes', 'globalDefault'], (data) => {
      const siteVolumes = data.siteVolumes || {};
      const saved = siteVolumes[currentDomain];

      if (saved) {
        currentVolume = typeof saved.volume === 'number' ? saved.volume : 1.0;
        isMuted = Boolean(saved.muted);
        hasCustomSetting = true;
        // Automatically activate capture with saved preference on popup open
        applyVolume(currentVolume, isMuted, false);
      } else {
        currentVolume = typeof data.globalDefault === 'number' ? data.globalDefault : 1.0;
        isMuted = false;
        hasCustomSetting = false;
      }

      if (currentVolume > 1.0) {
        chkBoost.checked = true;
        volumeSliderEl.max = '200';
      }

      renderUI();
    });
  } catch (err) {
    showRestricted();
  }

  function showRestricted() {
    mainView.style.display = 'none';
    restrictedView.style.display = 'flex';
  }

  volumeSliderEl.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    applyVolume(val / 100, false);
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.volume, 10);
      applyVolume(val / 100, false);
    });
  });

  btnMute.addEventListener('click', () => {
    if (isMuted) {
      applyVolume(previousVolume > 0 ? previousVolume : 1.0, false);
    } else {
      applyVolume(currentVolume, true);
    }
  });

  chkBoost.addEventListener('change', (e) => {
    if (e.target.checked) {
      volumeSliderEl.max = '200';
    } else {
      volumeSliderEl.max = '100';
      if (currentVolume > 1.0) {
        applyVolume(1.0, isMuted);
      }
    }
    renderUI();
  });

  btnReset.addEventListener('click', () => {
    if (!currentDomain) return;

    chrome.storage.local.get(['siteVolumes', 'globalDefault'], (data) => {
      const siteVolumes = data.siteVolumes || {};
      delete siteVolumes[currentDomain];
      chrome.storage.local.set({ siteVolumes });

      const def = typeof data.globalDefault === 'number' ? data.globalDefault : 1.0;
      hasCustomSetting = false;
      applyVolume(def, false, false);
    });
  });

  btnOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      btnMute.click();
    } else if (e.key === 'ArrowLeft') {
      const step = e.shiftKey ? 10 : 5;
      const next = Math.max(0, Math.round(currentVolume * 100) - step);
      applyVolume(next / 100, false);
    } else if (e.key === 'ArrowRight') {
      const step = e.shiftKey ? 10 : 5;
      const max = parseInt(volumeSliderEl.max, 10);
      const next = Math.min(max, Math.round(currentVolume * 100) + step);
      applyVolume(next / 100, false);
    }
  });
});
