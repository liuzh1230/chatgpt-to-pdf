/* Self-contained so chrome.scripting can serialize it into the source page. */
async function waitForSharedConversation(expectedUrl) {
  const start = Date.now();
  const selector = '[data-message-author-role="user"],[data-message-author-role="assistant"],' +
    '[data-chatgpt-search-unit-key],[data-content-search-unit-key],' +
    '[data-testid^="conversation-turn-"],[data-turn="user"],[data-turn="assistant"]';
  const visible = (element) => {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.contentVisibility === 'hidden') return false;
    }
    return true;
  };
  let previous = '';
  let stableSince = 0;
  return new Promise((resolve) => {
    const finish = (result) => { clearInterval(timer); resolve(result); };
    const check = () => {
      const current = location.origin + location.pathname.replace(/\/$/, '');
      if (current.toLowerCase() !== expectedUrl.toLowerCase()) {
        finish({ error: '分享页已跳转到其他地址。请确认链接可访问，再重新读取。' }); return;
      }
      const elements = [...document.querySelectorAll(selector)].filter(visible);
      const signature = elements.map(el => el.textContent + '\n' + [...el.querySelectorAll('img')].map(img => img.currentSrc || img.src).join('\n') + '\n' + el.querySelectorAll('math').length).join('\n\0');
      const hasContent = elements.some(el => el.textContent.trim() || el.querySelector('img,math'));
      const generating = document.querySelector('[data-testid="stop-button"],[aria-label="Stop generating"],[aria-label="停止生成"]');
      if (hasContent && !generating && document.readyState !== 'loading') {
        if (signature !== previous) { previous = signature; stableSince = Date.now(); }
        if (Date.now() - stableSince >= 1800) {
          const emptyTurns = elements.filter(el => el.matches('[data-testid^="conversation-turn-"],[data-turn="user"],[data-turn="assistant"]') &&
            !el.querySelector('[data-message-author-role],.markdown,[data-markdown-text-style],[data-message-content],.whitespace-pre-wrap,img,math,[data-math-source]')).length;
          finish({ ready: true, warnings: emptyTurns ? [`分享页有 ${emptyTurns} 个对话区块没有可读取的正文，可能未加载或未包含在分享中。请核对原分享页；本次导出不代表完整聊天。`] : [] }); return;
        }
      } else { previous = ''; stableSince = 0; }
      if (Date.now() - start >= 45000) {
        finish({ error: hasContent
          ? '分享页内容仍在变化，请等待加载完成后重试，或在分享页点击扩展图标导出。'
          : '未能读取分享内容。链接可能已失效、需要登录或网页验证，也可能尚未加载完成。请检查已打开的分享页，处理后重试，或在该页点击扩展图标导出。' });
      }
    };
    const timer = setInterval(check, 350);
    check();
  });
}
