/* Chat content lives only in storage.session. Preferences use storage.local. */
const PREFIX = 'capture:';

chrome.action.onClicked.addListener((tab) => { void openCapture(tab); });

async function openCapture(tab) {
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
    previewTab = await chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') + '?id=' + id });
    const base = { createdAt: Date.now(), previewTabId: previewTab.id };
    await chrome.storage.session.set({ [key]: { ...base, status: 'loading' } });
    let url;
    try { url = new URL(tab.url); } catch { /* handled below */ }
    if (!url || url.protocol !== 'https:' || !['chatgpt.com', 'chat.openai.com'].includes(url.hostname)) {
      throw new Error('请先打开 chatgpt.com 中的一段聊天，再点击浏览器工具栏里的“对话成册”。');
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, files: ['sanitize.js', 'capture.js']
    });
    const data = results[0]?.result;
    if (!data?.messages?.length) {
      throw new Error('没有找到聊天正文。请等待页面加载、展开聊天内容，再从 ChatGPT 页面点击扩展。网页结构变化也可能导致此问题。');
    }
    // A closed preview must not leave an orphaned copy behind.
    try { await chrome.tabs.get(previewTab.id); } catch { await chrome.storage.session.remove(key); return; }
    await chrome.storage.session.set({ [key]: { ...base, status: 'ready', data } });
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
