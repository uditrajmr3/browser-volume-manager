# SiteVolume

A lightweight browser extension that lets you control and permanently remember volume levels for individual websites.

## Overview

Many websites (like board game platforms, web games, browser tools, and social feeds) lack dedicated audio volume sliders. If your computer system volume is kept high for media playback on YouTube or Netflix, unexpected sound effects can be deafening.

**SiteVolume** solves this by routing tab audio through Chrome's tab capture engine and Web Audio API, automatically applying and remembering your preferred volume for that specific domain forever.

## Features

- **Persistent Domain Memory**: Set a volume once (e.g., `chess.com` at 25%), and it is remembered across browser restarts and new tabs.
- **Hardware-Level Tab Capture**: Controls 100% of audio output — including WebAssembly game engines, HTML5 media, Web Audio graphs, and sound effects.
- **Quick Popup Controls**:
  - Smooth 0% to 100% volume slider (with optional Boost mode up to 200%).
  - Quick preset buttons: Mute, 25%, 50%, 75%, 100%.
  - Live icon badge showing current site volume level.
- **Site Manager (Options Page)**:
  - Search and filter all saved website rules.
  - Adjust or delete individual domain overrides.
  - Set a global default volume for unconfigured sites.
  - Export and import configuration backups (JSON).
- **Privacy First**: Runs entirely locally in your browser with zero analytics or external requests.

## Installation (Developer Mode / Unpacked)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/<your-username>/browser-volume-manager.git
   ```
2. Open your browser and navigate to the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Enable **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the repository directory.
5. Pin **SiteVolume** to your browser toolbar for fast access.

## Architecture

- **Manifest V3**: Fully compliant with the latest Chrome extension standards.
- **Service Worker (`scripts/background.js`)**: Coordinates tab capture stream IDs, badge text, and cross-tab settings sync.
- **Offscreen Document (`offscreen/`)**: Houses the `AudioContext` and `GainNode` audio routing graph to regulate audio streams without UI latency.
- **Chrome Storage API**: Persists domain settings locally.
