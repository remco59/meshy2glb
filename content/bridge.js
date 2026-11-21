(() => {
  "use strict";
  const CHANNEL = "MESHY_GLB_EXPORTER_V1";
  const CHUNK_SIZE = 192 * 1024;
  const active = new Set();
  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    return btoa(binary);
  }
  function send(message) {
    return chrome.runtime.sendMessage(message).then(result => {
      if (result?.error) throw new Error(result.error);
      return result;
    });
  }
  async function storeCapture(payload) {
    if (!payload?.buffer || !(payload.buffer instanceof ArrayBuffer)) return;
    const bytes = new Uint8Array(payload.buffer);
    const id = payload.id;
    if (active.has(id)) return;
    active.add(id);
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
    try {
      await send({ type: "CAPTURE_START", id, totalChunks, metadata: { filename: payload.filename, size: bytes.length, source: payload.source, capturedAt: payload.capturedAt } });
      for (let index = 0; index < totalChunks; index++) {
        const chunk = bytes.subarray(index * CHUNK_SIZE, Math.min((index + 1) * CHUNK_SIZE, bytes.length));
        await send({ type: "CAPTURE_CHUNK", id, index, data: bytesToBase64(chunk) });
      }
      await send({ type: "CAPTURE_COMPLETE", id });
      console.info("[Meshy Exporter] Captured", payload.filename);
    } catch (error) {
      await send({ type: "CAPTURE_ABORT", id }).catch(() => {});
      console.warn("[Meshy Exporter] Capture failed:", error.message);
    } finally { active.delete(id); }
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== CHANNEL) return;
    const { type, payload } = event.data;
    if (type === "capture-glb") void storeCapture(payload);
    if (type === "capture-asset" && payload?.url) {
      try {
        const url = new URL(payload.url);
        if (url.protocol === "https:" && /\\.glb(?:[?#]|$)/i.test(url.href)) void send({ type: "SAVE_ASSET", url: url.href, name: payload.name });
      } catch {}
    }
  });
})();