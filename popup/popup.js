const $ = id => document.getElementById(id);
function send(message) { return chrome.runtime.sendMessage(message).then(result => { if (result?.error) throw new Error(result.error); return result; }); }
function formatSize(bytes) { if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function empty(container, title, description) { container.innerHTML = ""; const div = document.createElement("div"); div.className = "empty"; const strong = document.createElement("strong"); strong.textContent = title; const p = document.createElement("div"); p.textContent = description; div.append(strong, p); container.append(div); }
function createItem({ title, subtitle, id, downloadType, deleteType }) {
  const row = document.createElement("article"); row.className = "item";
  const icon = document.createElement("div"); icon.className = "file-icon"; icon.textContent = "GLB";
  const details = document.createElement("div"); details.className = "details";
  const name = document.createElement("strong"); name.textContent = title;
  const meta = document.createElement("small"); meta.textContent = subtitle;
  details.append(name, meta);
  const actions = document.createElement("div"); actions.className = "actions";
  const download = document.createElement("button"); download.className = "download"; download.textContent = "Download"; download.addEventListener("click", async () => { download.disabled = true; try { await send({ type: downloadType, id }); } catch (e) { $("status").textContent = e.message; } finally { download.disabled = false; } });
  const remove = document.createElement("button"); remove.textContent = "×"; remove.title = "Delete"; remove.addEventListener("click", async () => { await send({ type: deleteType, id }); await refresh(); });
  actions.append(download, remove); row.append(icon, details, actions); return row;
}
async function refresh() {
  try {
    const { models = [], assets = [] } = await send({ type: "LIST_ITEMS" });
    $("model-count").textContent = models.length; $("asset-count").textContent = assets.length;
    const modelList = $("models"), assetList = $("assets"); modelList.replaceChildren(); assetList.replaceChildren();
    if (!models.length) empty(modelList, "No captured models yet", "Open a Meshy model and use its Export / Download action.");
    for (const item of models) modelList.append(createItem({ title: item.filename, subtitle: `${formatSize(item.size)} · ${item.source} · ${new Date(item.capturedAt).toLocaleString()}`, id: item.id, downloadType: "DOWNLOAD_MODEL", deleteType: "DELETE_MODEL" }));
    if (!assets.length) empty(assetList, "No rigged assets found", "Open or refresh an animation task in Meshy.");
    for (const item of assets) assetList.append(createItem({ title: item.name, subtitle: `Rigged asset · ${new Date(item.capturedAt).toLocaleString()}`, id: item.id, downloadType: "DOWNLOAD_ASSET", deleteType: "DELETE_ASSET" }));
    $("status").textContent = "Library up to date";
  } catch (error) { $("status").textContent = error.message; }
}
document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
  $("models").classList.toggle("hidden", button.dataset.tab !== "models");
  $("assets").classList.toggle("hidden", button.dataset.tab !== "assets");
}));
$("refresh").addEventListener("click", refresh);
refresh();