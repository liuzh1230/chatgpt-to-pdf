/* Chat content lives only in storage.session. Preferences use storage.local. */
importScripts('share-url.js', 'share-ready.js', 'share-background.js');
const PREFIX = 'capture:';

chrome.action.onClicked.addListener((tab) => { void openCapture(tab); });

async function openCapture(tab, shared = null) {
  const id = crypto.randomUUID();
  const key = PREFIX + id;
  let previewTab;
  try {
    // Clear abandoned records without disturbing other open previews.
    const records = await chrome.storage.session.get(null);
    const stale = Object.entries(records).filter(([k, v]) =>
      k.startsWith(PREFIX) && Date.now() - v.createdAt > 6 * 60 * 60 * 1000
    ).map(([k]) => k);
    if (stale.length) await chrome.storage.session.remove(stale);
    await chrome.storage.session.set({ [key]: { status: 'loading', createdAt: Date.now() } });
    // Keep the source visible until capture finishes. Switching tabs first can
    // let the page suspend or hide its conversation before the script reads it.
    previewTab = await chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') + '?id=' + id, active: false });
    const base = { createdAt: Date.now(), previewTabId: previewTab.id };
    await chrome.storage.session.set({ [key]: { ...base, status: 'loading' } });
    let url;
    try { url = new URL(tab.url); } catch { /* handled below */ }
    if (!url || url.protocol !== 'https:' || !['chatgpt.com', 'chat.openai.com'].includes(url.hostname)) {
      throw new Error('请先打开 chatgpt.com 中的一段聊天，再点击浏览器工具栏里的“对话成册”。');
    }
    // Pin link exports to the loaded document, protecting against a later navigation.
    const target = shared?.documentId ? { tabId: tab.id, documentIds: [shared.documentId] } : { tabId: tab.id };
    if (shared) {
      const check = await chrome.scripting.executeScript({ target, func: () => location.origin + location.pathname });
      if (ChatPdfShare.parseShareUrl(check[0]?.result) !== shared.url) throw new Error('分享页地址发生了变化，请重新读取。');
    }
    await chrome.scripting.executeScript({ target, files: ['sanitize.js'] });
    if (shared) await chrome.scripting.executeScript({ target, files: ['vendor/katex.min.js', 'share-math.js'] });
    const results = await chrome.scripting.executeScript({
      target, files: ['capture.js']
    });
    const data = results[0]?.result;
    if (shared && ChatPdfShare.parseShareUrl(data?.url) !== shared.url) throw new Error('读取期间分享页地址发生了变化，请重新读取。');
    if (shared) {
      const math = await chrome.scripting.executeScript({ target, func: () => [...(globalThis.ChatPdfShareMathWarnings || [])] });
      data.warnings = [...(data.warnings || []), ...(shared.warnings || []), ...(math[0]?.result || [])];
    }
    if (!Array.isArray(data?.messages)) {
      throw new Error('读取脚本没有返回有效结果。请重新加载扩展、刷新 ChatGPT 页面后重试。');
    }
    if (!data.messages.length) {
      const d = data.diagnostics;
      const detail = d ? `（诊断：作者标记 ${d.roleNodes}，可见 ${d.visibleRoleNodes}，对话区块 ${d.turnNodes}，新版区块 ${d.modernUnitNodes || 0}）` : '';
      throw new Error('没有找到聊天正文。请确认当前聊天已加载完成，再重新导出。若仍失败，请将此提示发给维护者。' + detail);
    }
    // A closed preview must not leave an orphaned copy behind.
    try { await chrome.tabs.get(previewTab.id); } catch { await chrome.storage.session.remove(key); return; }
    await chrome.storage.session.set({ [key]: { ...base, status: 'ready', data } });
    await chrome.tabs.update(previewTab.id, { active: true });
  } catch (error) {
    const quota = /quota|bytes|storage/i.test(error.message || '');
    const message = quota
      ? '这段聊天超过临时存储容量。请关闭其他导出预览，或在原页面收起部分图片后重试。'
      : (error.message || '读取失败。请刷新 ChatGPT 页面后重试。');
    try {
      if (previewTab) await chrome.tabs.get(previewTab.id);
      await chrome.storage.session.set({ [key]: {
        status: 'error', error: message, createdAt: Date.now(), previewTabId: previewTab?.id
      } });
      if (previewTab) await chrome.tabs.update(previewTab.id, { active: true });
    } catch { await chrome.storage.session.remove(key); }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.get(null).then((records) => {
    const keys = Object.entries(records).filter(([k, v]) =>
      k.startsWith(PREFIX) && v.previewTabId === tabId
    ).map(([k]) => k);
    if (keys.length) return chrome.storage.session.remove(keys);
  });
});
