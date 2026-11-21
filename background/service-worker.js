import { openDatabase } from "../shared/db.js";

const MAX_MODEL_BYTES = 300 * 1024 * 1024;

function cleanFilename(value, fallback = "meshy-model.glb") {
  const cleaned = String(value || "").replace(/[<>:"/\\|?*\\u0000-\\u001f]/g, "-").replace(/\\s+/g, " ").replace(/^[.\\s-]+|[.\\s-]+$/g, "").slice(0, 120);
  return (cleaned || fallback).toLowerCase().endsWith(".glb") ? (cleaned || fallback) : `${cleaned || fallback}.glb`;
}
function decodeBase64(value) {
  if (typeof value !== "string" || value.length > 400_000) throw new Error("Invalid or oversized model chunk.");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function saveModel(record) {
  const db = await openDatabase();
  const tx = db.transaction("models", "readwrite");
  tx.objectStore("models").put(record);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
async function getModel(id) {
  const db = await openDatabase(), tx = db.transaction("models", "readonly");
  const value = await new Promise((resolve, reject) => { const r = tx.objectStore("models").get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  return value;
}
async function getAsset(id) {
  const db = await openDatabase(), tx = db.transaction("assets", "readonly");
  return await new Promise((resolve, reject) => { const r = tx.objectStore("assets").get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
const transfers = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "CAPTURE_START") {
      if (!/^[a-f0-9]{64}$/.test(message.id) || !Number.isInteger(message.totalChunks) || message.totalChunks < 1 || message.totalChunks > 1700) throw new Error("Invalid capture metadata.");
      transfers.set(message.id, { metadata: message.metadata || {}, totalChunks: message.totalChunks, chunks: new Map(), bytes: 0, tabId: sender.tab?.id });
      return { accepted: true };
    }
    if (message?.type === "CAPTURE_CHUNK") {
      const transfer = transfers.get(message.id);
      if (!transfer || !Number.isInteger(message.index) || message.index < 0 || message.index >= transfer.totalChunks) throw new Error("Unknown capture transfer.");
      if (transfer.chunks.has(message.index)) return { accepted: true };
      const bytes = decodeBase64(message.data);
      transfer.bytes += bytes.byteLength;
      if (transfer.bytes > MAX_MODEL_BYTES) { transfers.delete(message.id); throw new Error("Model exceeds 300 MB limit."); }
      transfer.chunks.set(message.index, bytes);
      return { accepted: true };
    }
    if (message?.type === "CAPTURE_COMPLETE") {
      const transfer = transfers.get(message.id);
      if (!transfer || transfer.chunks.size !== transfer.totalChunks) throw new Error("Capture is incomplete.");
      const blobParts = [];
      for (let i = 0; i < transfer.totalChunks; i++) {
        const chunk = transfer.chunks.get(i);
        if (!chunk) throw new Error("Missing model chunk.");
        blobParts.push(chunk);
      }
      const blob = new Blob(blobParts, { type: "model/gltf-binary" });
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const record = { id, filename: cleanFilename(transfer.metadata.filename), size: blob.size, source: transfer.metadata.source || "unknown", capturedAt: transfer.metadata.capturedAt || Date.now(), blob };
      await saveModel(record);
      transfers.delete(message.id);
      return { accepted: true, id };
    }
    if (message?.type === "CAPTURE_ABORT") { transfers.delete(message.id); return { accepted: true }; }
    if (message?.type === "SAVE_ASSET") {
      const url = new URL(message.url);
      if (url.protocol !== "https:" || !/\\.glb(?:[?#]|$)/i.test(url.href)) throw new Error("Only HTTPS GLB URLs are accepted.");
      const id = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url.href)).then(buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join(""));
      const db = await openDatabase(), tx = db.transaction("assets", "readwrite");
      tx.objectStore("assets").put({ id, name: String(message.name || "Rigged asset").slice(0, 120), url: url.href, capturedAt: Date.now() });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      return { accepted: true };
    }
    if (message?.type === "DOWNLOAD_MODEL") {
      const item = await getModel(message.id);
      if (!item) throw new Error("Model not found.");
      const url = URL.createObjectURL(item.blob);
      chrome.downloads.download({ url, filename: cleanFilename(item.filename), saveAs: true }, () => {
        if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      });
      return null;
    }
    if (message?.type === "DOWNLOAD_ASSET") {
      const item = await getAsset(message.id);
      if (!item) throw new Error("Asset not found.");
      chrome.downloads.download({ url: item.url, filename: cleanFilename(item.name), saveAs: true });
      return { accepted: true };
    }
    if (message?.type === "DELETE_MODEL" || message?.type === "DELETE_ASSET") {
      const store = message.type === "DELETE_MODEL" ? "models" : "assets";
      const db = await openDatabase(), tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(message.id);
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      return { accepted: true };
    }
    if (message?.type === "LIST_ITEMS") {
      const db = await openDatabase(), tx = db.transaction(["models", "assets"], "readonly");
      const read = store => new Promise((resolve, reject) => { const r = tx.objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const [models, assets] = await Promise.all([read("models"), read("assets")]);
      return { models: models.map(({ blob, ...rest }) => rest).sort((a,b) => b.capturedAt-a.capturedAt), assets: assets.sort((a,b) => b.capturedAt-a.capturedAt) };
    }
    return undefined;
  })().then(result => { if (result !== null) sendResponse(result); }).catch(error => sendResponse({ error: error.message }));
  return true;
});