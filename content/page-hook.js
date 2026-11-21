(() => {
  "use strict";
  if (window.__meshyExporterHook) return;
  window.__meshyExporterHook = true;
  const CHANNEL = "MESHY_GLB_EXPORTER_V1";
  const MAX_CAPTURE_BYTES = 300 * 1024 * 1024;
  let serial = 0;

  function emit(type, payload) {
    window.postMessage({ source: CHANNEL, type, payload }, location.origin);
  }
  function isGlbHeader(bytes) {
    return bytes?.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
  }
  function filename() {
    const title = document.querySelector("h1")?.textContent?.trim() || `meshy-${Date.now()}`;
    return title.replace(/[<>:"/\\|?*\\u0000-\\u001f]/g, "-").replace(/\\s+/g, " ").slice(0, 100) + ".glb";
  }
  async function emitGlb(source, buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12 || buffer.byteLength > MAX_CAPTURE_BYTES) return;
    if (!isGlbHeader(new Uint8Array(buffer, 0, 4))) return;
    const id = `${Date.now().toString(16)}${(++serial).toString(16).padStart(8, "0")}`.padEnd(64, "0");
    emit("capture-glb", { id, buffer, filename: filename(), source, capturedAt: Date.now() });
  }
  function inspectTask(root) {
    const stack = [root], seen = new WeakSet();
    let count = 0;
    while (stack.length && count++ < 6000) {
      const node = stack.pop();
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (typeof node.armatureGlbUrl === "string") emit("capture-asset", { url: node.armatureGlbUrl, name: "Armature GLB" });
      if (typeof node.animationGlbUrl === "string") emit("capture-asset", { url: node.animationGlbUrl, name: "Animated Character GLB" });
      for (const value of Object.values(node)) if (value && typeof value === "object") stack.push(value);
    }
  }

  const OriginalWorker = window.Worker;
  if (OriginalWorker) {
    window.Worker = new Proxy(OriginalWorker, {
      construct(target, args, newTarget) {
        const worker = Reflect.construct(target, args, newTarget);
        worker.addEventListener("message", event => {
          const data = event.data;
          if (data?.type === "process" && data.success && data.data instanceof ArrayBuffer) void emitGlb("worker-decrypted", data.data.slice(0));
        }, true);
        return worker;
      }
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    const type = response.headers.get("content-type") || "";
    if (response.ok && (/\\.glb(?:[?#]|$)/i.test(url) || url.includes("misc/cdn-models") || /model\\/gltf-binary/i.test(type))) {
      try {
        const buffer = await response.clone().arrayBuffer();
        if (buffer.byteLength <= MAX_CAPTURE_BYTES) void emitGlb("fetch", buffer);
      } catch {}
    } else if (response.ok && /json/i.test(type)) {
      try { inspectTask(await response.clone().json()); } catch {}
    }
    return response;
  };

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = object => {
    if (object instanceof Blob && object.size >= 12 && object.size <= MAX_CAPTURE_BYTES) {
      void object.slice(0, 4).arrayBuffer().then(async header => {
        if (isGlbHeader(new Uint8Array(header))) await emitGlb("blob-url", await object.arrayBuffer());
      }).catch(() => {});
    }
    return originalCreateObjectURL(object);
  };

  console.info("[Meshy Exporter] Page hooks active.");
})();