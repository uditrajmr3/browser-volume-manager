/**
 * SiteVolume - Page Injected Audio Controller (MAIN world)
 * Injected at document_start into the page context.
 * Intercepts HTMLMediaElement (video/audio) and Web Audio API (AudioContext)
 * to allow smooth, zero-latency volume scaling and persistent site levels.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__SITE_VOLUME_INJECTED__) return;
  window.__SITE_VOLUME_INJECTED__ = true;

  // Current domain volume multiplier (1.0 = 100%, 0.5 = 50%, 0 = mute)
  let activeMultiplier = 1.0;
  let isMuted = false;

  // Active tracked HTMLMediaElements
  const activeMediaElements = new Set();

  // Web Audio Context master gains
  const contextGains = new WeakMap();
  const liveMasterGains = new Set();

  // Save native methods before any page script can tamper with them
  const origVolumeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const origPlay = HTMLMediaElement.prototype.play;
  const origConnect = AudioNode.prototype.connect;
  const origCreateGain = (window.AudioContext || window.webkitAudioContext)?.prototype.createGain;

  /**
   * Helper to compute effective volume factor
   */
  function getEffectiveMultiplier() {
    return isMuted ? 0 : Math.max(0, activeMultiplier);
  }

  /**
   * Update volume of an HTMLMediaElement
   */
  function applyMediaElementVolume(element) {
    if (!origVolumeDesc || !origVolumeDesc.set) return;
    try {
      const requested = element.__sv_requested_volume !== undefined 
        ? element.__sv_requested_volume 
        : origVolumeDesc.get.call(element);
      
      const effective = Math.min(1, Math.max(0, requested * getEffectiveMultiplier()));
      origVolumeDesc.set.call(element, effective);
    } catch (e) {
      // Element might be detached or in an invalid state
    }
  }

  /**
   * 1. Intercept HTMLMediaElement (Audio/Video elements)
   */
  if (origVolumeDesc && origVolumeDesc.set && origVolumeDesc.get) {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      get: function () {
        return this.__sv_requested_volume !== undefined 
          ? this.__sv_requested_volume 
          : origVolumeDesc.get.call(this);
      },
      set: function (value) {
        const num = Number(value);
        if (isNaN(num) || num < 0 || num > 1) {
          // Trigger browser's native error
          return origVolumeDesc.set.call(this, value);
        }
        this.__sv_requested_volume = num;
        const scaled = Math.min(1, Math.max(0, num * getEffectiveMultiplier()));
        origVolumeDesc.set.call(this, scaled);
      },
      configurable: true,
      enumerable: true
    });

    HTMLMediaElement.prototype.play = function (...args) {
      activeMediaElements.add(this);
      applyMediaElementVolume(this);

      const cleanup = () => {
        if (this.paused || this.ended) {
          activeMediaElements.delete(this);
        }
      };

      this.addEventListener('pause', cleanup, { once: true });
      this.addEventListener('ended', cleanup, { once: true });

      return origPlay.apply(this, args);
    };
  }

  /**
   * 2. Intercept Web Audio API (Used by Chess.com, HTML5 games, synth, WebAudio)
   */
  function getOrCreateMasterGain(ctx) {
    let gainNode = contextGains.get(ctx);
    if (!gainNode && origCreateGain) {
      try {
        gainNode = origCreateGain.call(ctx);
        const mult = getEffectiveMultiplier();
        gainNode.gain.setValueAtTime(mult, ctx.currentTime);

        // Connect our master gain directly to real hardware destination
        origConnect.call(gainNode, ctx.destination);

        contextGains.set(ctx, gainNode);
        liveMasterGains.add(gainNode);
      } catch (e) {
        console.warn('[SiteVolume] Failed to attach master gain to context:', e);
      }
    }
    return gainNode;
  }

  if (origConnect && origCreateGain) {
    AudioNode.prototype.connect = function (destinationNode, ...args) {
      try {
        // If connecting to the context destination (speakers/output)
        if (destinationNode && this.context && destinationNode === this.context.destination) {
          const masterGain = getOrCreateMasterGain(this.context);
          if (masterGain) {
            return origConnect.call(this, masterGain, ...args);
          }
        }
      } catch (e) {
        // Fallback to native connect on any unexpected issue
      }
      return origConnect.call(this, destinationNode, ...args);
    };
  }

  /**
   * Apply multiplier updates to all active media & audio contexts
   */
  function refreshAllAudio() {
    const mult = getEffectiveMultiplier();

    // 1. Update HTMLMediaElements
    for (const el of activeMediaElements) {
      applyMediaElementVolume(el);
    }
    // Also scan all audio/video currently in document
    const domMedia = document.querySelectorAll('video, audio');
    domMedia.forEach((el) => {
      applyMediaElementVolume(el);
    });

    // 2. Update Web Audio master gain nodes
    for (const gainNode of liveMasterGains) {
      try {
        if (gainNode.context.state === 'closed') {
          liveMasterGains.delete(gainNode);
          continue;
        }
        gainNode.gain.cancelScheduledValues(gainNode.context.currentTime);
        gainNode.gain.setValueAtTime(mult, gainNode.context.currentTime);
      } catch (e) {
        liveMasterGains.delete(gainNode);
      }
    }
  }

  /**
   * Listen for messages from content-bridge.js (ISOLATED world)
   */
  window.addEventListener('__SITE_VOLUME_APPLY__', function (event) {
    if (!event.detail) return;
    const { volume, muted } = event.detail;

    if (typeof volume === 'number') {
      activeMultiplier = volume;
    }
    if (typeof muted === 'boolean') {
      isMuted = muted;
    }

    refreshAllAudio();
  });

  // Signal bridge that inject script is ready to receive initial volume
  window.dispatchEvent(new CustomEvent('__SITE_VOLUME_READY__'));
})();

