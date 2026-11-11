/**
 * SiteVolume - Options Page Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const globalDefaultSlider = document.getElementById('globalDefaultSlider');
  const globalDefaultLabel = document.getElementById('globalDefaultLabel');
  const siteListEl = document.getElementById('siteList');
  const emptyStateEl = document.getElementById('emptyState');
  const siteCountEl = document.getElementById('siteCount');
  const searchSitesInput = document.getElementById('searchSites');
  const btnExport = document.getElementById('btnExport');
  const importFileInput = document.getElementById('importFileInput');
  const btnClearAll = document.getElementById('btnClearAll');

  let siteVolumes = {};
  let globalDefault = 1.0;

  // Load data
  function loadData() {
    chrome.storage.local.get(['siteVolumes', 'globalDefault'], (data) => {
      siteVolumes = data.siteVolumes || {};
      globalDefault = typeof data.globalDefault === 'number' ? data.globalDefault : 1.0;

      const pct = Math.round(globalDefault * 100);
      globalDefaultSlider.value = pct;
      globalDefaultLabel.textContent = `${pct}%`;

      renderList();
    });
  }

  // Render list of sites
  function renderList() {
    const filter = searchSitesInput.value.trim().toLowerCase();
    const domains = Object.keys(siteVolumes).sort();

    siteListEl.innerHTML = '';
    let visibleCount = 0;

    for (const domain of domains) {
      if (filter && !domain.includes(filter)) continue;
      visibleCount++;

      const itemData = siteVolumes[domain];
      const vol = typeof itemData.volume === 'number' ? itemData.volume : 1.0;
      const pct = Math.round(vol * 100);
      const isMuted = Boolean(itemData.muted);

      const itemEl = document.createElement('div');
      itemEl.className = 'site-item';

      itemEl.innerHTML = `
        <div class="site-identity">
          <span class="site-name" title="${domain}">${domain}</span>
        </div>
        <div class="site-actions">
          <input 
            type="range" 
            min="0" 
            max="200" 
            value="${isMuted ? 0 : pct}" 
            data-domain="${domain}"
            class="site-slider"
          >
          <span class="site-vol-label ${isMuted ? 'muted-label' : ''}">
            ${isMuted ? 'MUTED' : `${pct}%`}
          </span>
          <button class="delete-btn" data-domain="${domain}" title="Remove override">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      // Slider event
      const slider = itemEl.querySelector('.site-slider');
      const label = itemEl.querySelector('.site-vol-label');
      slider.addEventListener('input', (e) => {
        const newPct = parseInt(e.target.value, 10);
        const newVol = newPct / 100;
        const newMuted = newPct === 0;

        siteVolumes[domain] = {
          volume: newVol,
          muted: newMuted,
          updatedAt: Date.now()
        };

        label.textContent = newMuted ? 'MUTED' : `${newPct}%`;
        label.className = `site-vol-label ${newMuted ? 'muted-label' : ''}`;

        saveAndBroadcast(domain, newVol, newMuted);
      });

      // Delete event
      const delBtn = itemEl.querySelector('.delete-btn');
      delBtn.addEventListener('click', () => {
        delete siteVolumes[domain];
        chrome.storage.local.set({ siteVolumes }, () => {
          // Broadcast reset to default
          chrome.runtime.sendMessage({
            type: 'BROADCAST_SITE_VOLUME',
            domain,
            volume: globalDefault,
            muted: false
          });
          renderList();
        });
      });

      siteListEl.appendChild(itemEl);
    }

    siteCountEl.textContent = `${domains.length} website${domains.length === 1 ? '' : 's'} saved`;

    if (domains.length === 0) {
      emptyStateEl.style.display = 'block';
      siteListEl.style.display = 'none';
    } else {
      emptyStateEl.style.display = 'none';
      siteListEl.style.display = 'flex';
    }
  }

  function saveAndBroadcast(domain, volume, muted) {
    chrome.storage.local.set({ siteVolumes });
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (!t.url) continue;
        try {
          const u = new URL(t.url);
          const d = u.hostname.replace(/^www\./i, '').toLowerCase();
          if (d === domain) {
            chrome.runtime.sendMessage({
              type: 'SET_TAB_VOLUME',
              tabId: t.id,
              domain,
              volume,
              muted
            });
          }
        } catch (e) {}
      }
    });
  }

  // Global default slider
  globalDefaultSlider.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10);
    globalDefault = pct / 100;
    globalDefaultLabel.textContent = `${pct}%`;
    chrome.storage.local.set({ globalDefault });
  });

  // Search filter
  searchSitesInput.addEventListener('input', () => {
    renderList();
  });

  // Clear all
  btnClearAll.addEventListener('click', () => {
    if (Object.keys(siteVolumes).length === 0) return;
    if (confirm('Are you sure you want to remove volume overrides for all saved websites?')) {
      siteVolumes = {};
      chrome.storage.local.set({ siteVolumes }, () => {
        renderList();
      });
    }
  });

  // Export JSON
  btnExport.addEventListener('click', () => {
    const dataToExport = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      globalDefault,
      siteVolumes
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sitevolume-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import JSON
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported && typeof imported === 'object') {
          if (imported.siteVolumes && typeof imported.siteVolumes === 'object') {
            siteVolumes = { ...siteVolumes, ...imported.siteVolumes };
          }
          if (typeof imported.globalDefault === 'number') {
            globalDefault = imported.globalDefault;
          }

          chrome.storage.local.set({ siteVolumes, globalDefault }, () => {
            alert('Settings imported successfully!');
            loadData();
          });
        }
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  });

  // Initial load
  loadData();
});

