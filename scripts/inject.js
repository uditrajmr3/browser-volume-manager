/**
 * SiteVolume - Page Context Audio Interceptor (MAIN world)
 * Hooks HTMLMediaElement and Web Audio API (AudioContext)
 */

(function () {
  'use strict';

  if (window.__SITE_VOLUME_INJECTED__) return;
  window.__SITE_VOLUME_INJECTED__ = true;

  let activeMultiplier = 1.0;
  let isMuted = false;

  const activeMediaElements = new Set();
  const contextGains = new WeakMap();
  const liveMasterGains = new Set();

  // 1. Capture Prototype references
  const origVolumeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const origPlay = HTMLMediaElement.prototype.play;
  const origConnect = AudioNode.prototype.connect;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const BaseAudioContextClass = window.BaseAudioContext || AudioContextClass;
  const origCreateGain = BaseAudioContextClass?.prototype.createGain || AudioContextClass?.prototype.createGain;

  function getEffectiveMultiplier() {
    return isMuted ? 0 : Math.max(0, activeMultiplier);
  }

  function applyMediaElementVolume(element) {
    if (!origVolumeDesc || !origVolumeDesc.set) return;
    try {
      const requested = element.__sv_requested_volume !== undefined
        ? element.__sv_requested_volume
        : (origVolumeDesc.get ? origVolumeDesc.get.call(element) : 1.0);

      element.__sv_requested_volume = requested;
      const effective = Math.min(1, Math.max(0, requested * getEffectiveMultiplier()));
      origVolumeDesc.set.call(element, effective);
    } catch (e) {}
  }

  // 2. Intercept HTMLMediaElement (video, audio, new Audio())
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
      if (this.__sv_requested_volume === undefined) {
        this.__sv_requested_volume = origVolumeDesc.get ? origVolumeDesc.get.call(this) : 1.0;
      }
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

  // 3. Intercept Web Audio API (AudioContext)
  function getOrCreateMasterGain(ctx) {
    let gainNode = contextGains.get(ctx);
    if (!gainNode && origCreateGain && origConnect) {
      try {
        gainNode = origCreateGain.call(ctx);
        const mult = getEffectiveMultiplier();
        gainNode.gain.setValueAtTime(mult, ctx.currentTime);

        // Route master gain into real destination
        origConnect.call(gainNode, ctx.destination);

        contextGains.set(ctx, gainNode);
        liveMasterGains.add(gainNode);
      } catch (e) {
        console.warn('[SiteVolume] Master gain init error:', e);
      }
    }
    return gainNode;
  }

  if (origConnect && origCreateGain) {
    AudioNode.prototype.connect = function (destinationNode, ...args) {
      try {
        if (destinationNode && this.context && destinationNode === this.context.destination) {
          const masterGain = getOrCreateMasterGain(this.context);
          if (masterGain) {
            return origConnect.call(this, masterGain, ...args);
          }
        }
      } catch (e) {}
      return origConnect.call(this, destinationNode, ...args);
    };
  }

  // 4. Update all playing and in-memory audio
  function refreshAllAudio() {
    const mult = getEffectiveMultiplier();

    // Update active media elements
    for (const el of activeMediaElements) {
      applyMediaElementVolume(el);
    }

    // Update all audio/video tags in the DOM
    try {
      const mediaInDOM = document.querySelectorAll('video, audio');
      mediaInDOM.forEach((el) => {
        applyMediaElementVolume(el);
      });
    } catch (e) {}

    // Update all Web Audio GainNodes
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

  // 5. Reliable cross-world communication using window.postMessage
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.source !== 'SITE_VOLUME_BRIDGE') return;

    const { volume, muted } = event.data;
    if (typeof volume === 'number') {
      activeMultiplier = volume;
    }
    if (typeof muted === 'boolean') {
      isMuted = muted;
    }

    refreshAllAudio();
  });

  // Signal bridge that script is mounted
  window.postMessage({ source: 'SITE_VOLUME_INJECT', type: 'READY' }, '*');
})();
