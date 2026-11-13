/**
 * SiteVolume - Offscreen Audio Controller
 * Captures tab audio streams and controls volume using Web Audio API GainNode.
 */

// Active captured tabs: Map<tabId, { stream, audioContext, gainNode, volume }>
const activeTabs = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'START_CAPTURE') {
    const { tabId, streamId, volume, muted } = message;
    startTabCapture(tabId, streamId, volume, muted)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'SET_VOLUME') {
    const { tabId, volume, muted } = message;
    setTabVolume(tabId, volume, muted);
    sendResponse({ success: true });
  } else if (message.type === 'STOP_CAPTURE') {
    const { tabId } = message;
    stopTabCapture(tabId);
    sendResponse({ success: true });
  } else if (message.type === 'PING') {
    sendResponse({ pong: true });
  }
});

async function startTabCapture(tabId, streamId, volume, muted) {
  // If already capturing this tab, just update volume
  if (activeTabs.has(tabId)) {
    setTabVolume(tabId, volume, muted);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();

    const targetVol = muted ? 0 : (typeof volume === 'number' ? volume : 1.0);
    gainNode.gain.setValueAtTime(targetVol, audioContext.currentTime);

    // Route: source -> gainNode -> speakers
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // If stream is ended by browser or tab closes
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onended = () => {
        stopTabCapture(tabId);
      };
    }

    activeTabs.set(tabId, {
      stream,
      audioContext,
      gainNode,
      volume: targetVol
    });

    console.log(`[SiteVolume Offscreen] Successfully captured audio for tab ${tabId} at volume ${targetVol}`);
  } catch (err) {
    console.error(`[SiteVolume Offscreen] Failed to capture tab ${tabId}:`, err);
    throw err;
  }
}

function setTabVolume(tabId, volume, muted) {
  const tabData = activeTabs.get(tabId);
  if (!tabData) return;

  const targetVol = muted ? 0 : (typeof volume === 'number' ? volume : 1.0);
  try {
    tabData.gainNode.gain.cancelScheduledValues(tabData.audioContext.currentTime);
    tabData.gainNode.gain.setValueAtTime(targetVol, tabData.audioContext.currentTime);
    tabData.volume = targetVol;
    console.log(`[SiteVolume Offscreen] Updated volume for tab ${tabId} to ${targetVol}`);
  } catch (e) {
    console.error(`[SiteVolume Offscreen] Error setting volume for tab ${tabId}:`, e);
  }
}

function stopTabCapture(tabId) {
  const tabData = activeTabs.get(tabId);
  if (tabData) {
    try {
      if (tabData.stream) {
        tabData.stream.getTracks().forEach((track) => track.stop());
      }
      if (tabData.audioContext && tabData.audioContext.state !== 'closed') {
        tabData.audioContext.close();
      }
    } catch (e) {}
    activeTabs.delete(tabId);
    console.log(`[SiteVolume Offscreen] Stopped capture for tab ${tabId}`);
  }
}

