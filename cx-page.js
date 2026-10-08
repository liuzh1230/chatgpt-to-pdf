/* Read-only adapter for the public CX template. Shared by readiness/capture;
 * never adds attributes to the source DOM or guesses roles on other pages. */
(() => {
  const isPage = () => location.origin === 'https://chatgpt.com' && /^\/s\/cx_[a-f0-9]{32}\/?$/i.test(location.pathname);
  const visible = (element) => {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.contentVisibility === 'hidden') return false;
    }
    return true;
  };
  const controls = 'button,[role="toolbar"],.sr-only,[data-testid*="copy"],[data-testid*="voice"],[data-testid*="feedback"]';
  function hasContent(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() && !node.parentElement.closest(controls + ',.katex-html') && visible(node.parentElement)) return true;
    }
    return [...element.querySelectorAll('img,math,[data-math-source]')].some(el => visible(el) && !el.closest(controls));
  }
  function discover() {
    const roots = [], warnings = [];
    if (!isPage()) return { roots, warnings };
    const sections = [...document.querySelectorAll('main > section[data-turn-key],[role="main"] > section[data-turn-key]')].filter(visible);
    const invalid = () => ({ roots: [], warnings: [], error: '此 /s/cx_ 分享页的消息结构尚未加载完整或无法识别。请等待页面加载后重试；若仍失败，请反馈此提示。' });
    if (!sections.length) return invalid();
    const ids = new Set(), turnKeys = new Set();
    for (const section of sections) {
      const key = section.getAttribute('data-turn-key');
      const articles = [...section.children].filter(el => el.tagName === 'ARTICLE' && visible(el));
      if (!/^turn-\d+$/.test(key) || turnKeys.has(key) || articles.length !== 2) return invalid();
      turnKeys.add(key);
      const [user, assistant] = articles;
      // This template marks the question with its own message ID and leaves the
      // answer unmarked. Validate the pair instead of alternating arbitrary nodes.
      if (!/^message-\d+$/.test(user.id) || !/^message-\d+$/.test(assistant.id) ||
          user.getAttribute('data-content-search-unit-key') !== user.id ||
          assistant.hasAttribute('data-content-search-unit-key') ||
          user.getAttribute('data-message-author-role') === 'assistant' ||
          assistant.getAttribute('data-message-author-role') === 'user' ||
          ids.has(user.id) || ids.has(assistant.id) || user.id === assistant.id) return invalid();
      ids.add(user.id); ids.add(assistant.id);
      const placeholders = [...user.querySelectorAll('button[disabled][aria-label="User attachment"],button[disabled][aria-label="用户附件"]')]
        .filter(el => visible(el) && !el.querySelector('img'));
      roots.push({ element: user, role: 'user', cx: true, missingAttachments: placeholders.length, hasContent: !!placeholders.length || hasContent(user) });
      roots.push({ element: assistant, role: 'assistant', cx: true, missingAttachments: 0, hasContent: hasContent(assistant) });
    }
    const missing = roots.reduce((sum, item) => sum + item.missingAttachments, 0);
    if (missing) warnings.push(`分享页有 ${missing} 个附件仅显示占位，未提供可读取的图片或文件；已保留文字说明，原附件不包含在 PDF 中。`);
    const empty = roots.filter(item => item.role === 'assistant' && !item.hasContent).length;
    if (empty) warnings.push(`分享页有 ${empty} 个回答没有可读取的正文，请等待加载完成后重新导出；本次不代表完整聊天。`);
    return { roots, warnings };
  }
  globalThis.ChatPdfCx = Object.freeze({ isPage, discover });
})();
