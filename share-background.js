/* Additive sharing workflow. The toolbar still calls the original openCapture. */
function waitForShareLoad(tabId, expectedUrl) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error, tab) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onRemoved.removeListener(removed);
      error ? reject(error) : resolve(tab);
    };
    const inspect = (tab) => {
      if (tab.status !== 'complete') return;
      let actual;
      try { actual = ChatPdfShare.parseShareUrl(tab.url); } catch { /* rejected below */ }
      if (actual !== expectedUrl) {
        finish(new Error('分享页跳转到了其他地址，可能需要登录或链接已失效。请检查已打开的页面，再重试。')); return;
      }
      finish(null, tab);
    };
    const updated = (id, change, tab) => { if (id === tabId) inspect(tab); };
    const removed = (id) => { if (id === tabId) finish(new Error('分享页已关闭，请重新读取链接。')); };
    const timer = setTimeout(() => finish(new Error('分享页加载超时，请检查网络和已打开的页面，然后重试。')), 45000);
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onRemoved.addListener(removed);
    void chrome.tabs.get(tabId).then(inspect, () => removed(tabId));
  });
}

const shareRequests = new Set();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'capture-share') return;
  // Only our own share form can trigger this path, never content scripts/web pages.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('share.html') || !sender.tab?.id) {
    sendResponse({ ok: false, error: '请从扩展的“分享链接导出”页面发起读取。' }); return;
  }
  const requesterId = sender.tab.id;
  if (shareRequests.has(requesterId)) { sendResponse({ ok: false, error: '这次读取尚未完成，请稍候。' }); return; }
  shareRequests.add(requesterId);
  void (async () => {
    try {
      const url = ChatPdfShare.parseShareUrl(message.url);
      if (!await chrome.permissions.contains({ origins: ChatPdfShare.origins })) {
        throw new Error('尚未允许读取 ChatGPT 分享页，请点击“读取分享链接”并允许网站访问。');
      }
      const source = await chrome.tabs.create({ url: ChatPdfShare.openShareUrl(url), active: true });
      await waitForShareLoad(source.id, url);
      if (url.includes('/s/cx_')) await chrome.scripting.executeScript({ target: { tabId: source.id }, files: ['cx-page.js'] });
      const results = await chrome.scripting.executeScript({
        target: { tabId: source.id }, func: waitForSharedConversation, args: [url]
      });
      if (!results[0]?.result?.ready) throw new Error(results[0]?.result?.error || '分享页面已关闭或重新加载，请重试。');
      const current = await chrome.tabs.get(source.id);
      if (ChatPdfShare.parseShareUrl(current.url) !== url) throw new Error('分享页地址发生了变化，请重新读取原链接。');
      await openCapture(current, { url, documentId: results[0].documentId, warnings: results[0].result.warnings || [] });
      sendResponse({ ok: true });
    } catch (error) {
      // Keep the source tab for login/verification/inspection. Return to the form.
      try { await chrome.tabs.update(requesterId, { active: true }); } catch { /* form closed */ }
      sendResponse({ ok: false, error: error.message || '读取失败，请检查分享页面后重试。' });
    } finally { shareRequests.delete(requesterId); }
  })();
  return true;
});
