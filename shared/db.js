export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("meshy-glb-exporter", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("models")) db.createObjectStore("models", { keyPath: "id" });
      if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}