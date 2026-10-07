/* Shared by the form and service worker. No URL is fetched here. */
(() => {
  function parseShareUrl(input) {
    let url;
    try { url = new URL(typeof input === 'string' ? input.trim() : ''); } catch { /* invalid below */ }
    const hosts = ['chatgpt.com', 'chat.openai.com'];
    if (!url || url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password) {
      throw new Error('请输入完整的 ChatGPT 分享链接：https://chatgpt.com/share/…');
    }
    if (/^\/c\//.test(url.pathname) || /^\/g\//.test(url.pathname)) {
      throw new Error('这是私人聊天链接。请在 ChatGPT 中点击“分享”并复制分享链接；也可以打开原聊天，点击扩展图标导出。');
    }
    const match = /^\/share\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i.exec(url.pathname);
    if (!match) throw new Error('链接格式不正确，请复制 ChatGPT 的完整 /share/ 分享链接。');
    // Legacy public-share links redirect to chatgpt.com. Drop tracking queries/fragments.
    return 'https://chatgpt.com/share/' + match[1].toLowerCase();
  }
  globalThis.ChatPdfShare = Object.freeze({ parseShareUrl, origins: ['https://chatgpt.com/*'] });
})();
