# Meshy GLB Exporter

A Manifest V3 Chrome extension that captures GLB data produced by the Meshy web app and records rigged/animated GLB asset URLs exposed in task JSON responses.

## Features
- Captures decrypted GLB buffers from Worker messages, matching fetch responses and Blob object URLs.
- Discovers `armatureGlbUrl` and `animationGlbUrl` values in JSON responses the page already requests.
- Stores captured models and rigged asset metadata in a local IndexedDB library.
- Deduplicates model buffers by SHA-256 and supports download/delete actions.
- Uses a dark popup and narrow Meshy site scope.

## Install locally
1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable Developer mode and choose **Load unpacked**.
4. Select the repository folder containing `manifest.json`.
5. Open Meshy, open a model, and use its normal Export/Download flow.
6. Open the extension popup to inspect and download captured models.

## Notes and limitations
- This extension observes files the Meshy app has already decrypted or made available to the browser. It does not independently decrypt protected files, obtain keys, bypass account controls, or access private tasks.
- Worker message formats and task API response shapes can change; live compatibility must be tested against Meshy's current frontend.
- Large captures are chunk-transferred and capped at 300 MB. The local model bytes are held in IndexedDB.
- Rigged model downloads use HTTPS URLs exposed by JSON responses already requested by Meshy. Signed URLs may expire or be rejected by the remote host.
- Captured files and URLs remain in local browser storage. No telemetry or external backend is used.

## Architecture
```
manifest.json                 Manifest V3
content/page-hook.js          MAIN world Worker/fetch/Blob hooks
content/bridge.js             Isolated-world validated message bridge
background/service-worker.js  IndexedDB writes and Chrome Downloads
shared/db.js                  IndexedDB schema
popup/                        Popup and local model library
icons/                        Extension icons
```

## Upstream
Inspired by the behavior described in [youssef02/meshy2glb](https://github.com/youssef02/meshy2glb). The upstream repository does not include a license file; this implementation is written independently and does not copy its userscript source.
