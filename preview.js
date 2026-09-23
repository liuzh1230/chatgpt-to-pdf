/* No remote scripts, analytics, private ChatGPT endpoints or API keys. */
(() => {
  const $ = (id) => document.getElementById(id);
  const ids = ['paper', 'orientation', 'fontSize', 'scope', 'metadata', 'images'];
  const defaults = { paper: 'A4', orientation: 'portrait', fontSize: '11', scope: 'all', metadata: true, images: true };
  const choices = { paper: ['A4', 'Letter'], orientation: ['portrait', 'landscape'], fontSize: ['10', '11', '13'], scope: ['all', 'assistant', 'user'] };
  let data = null;
  let selected = new Set();
  let printing = false;
  let currentMessage = null;
  let highlightTimer;
  const articles = new Map();
  const pickers = new Map();
  let prefs = { ...defaults };
  const ext = typeof chrome !== 'undefined' && chrome.storage?.session;

  const roleName = (role) => role === 'user' ? '你' : 'ChatGPT';
  function message(text, error = false) {
    $('notice').textContent = text;
    $('notice').classList.toggle('error', error);
  }
  function readPrefs() {
    for (const id of ids) prefs[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value;
  }
  function savePrefs() {
    if (ext) void chrome.storage.local.set({ printPreferences: prefs }).catch(() => {});
  }
  function matchesScope(item) { return prefs.scope === 'all' || item.role === prefs.scope; }
  function included(item) { return selected.has(item.id) && matchesScope(item); }

  function clearNavigation() {
    clearTimeout(highlightTimer);
    if (currentMessage !== null) {
      articles.get(currentMessage)?.classList.remove('navigation-highlight');
      pickers.get(currentMessage)?.row.classList.remove('is-current');
      pickers.get(currentMessage)?.jump.removeAttribute('aria-current');
    }
    currentMessage = null;
  }

  function jumpToMessage(item, index) {
    const article = articles.get(item.id);
    if (!article) return;
    if (!matchesScope(item)) {
      $('navigation-status').textContent = `第 ${index + 1} 条被消息范围隐藏，请先调整左侧“消息范围”。`;
      return;
    }
    if (!selected.has(item.id)) {
      $('navigation-status').textContent = `第 ${index + 1} 条尚未勾选，勾选后即可定位。`;
      return;
    }
    clearNavigation();
    currentMessage = item.id;
    const { row, jump } = pickers.get(item.id);
    row.classList.add('is-current');
    jump.setAttribute('aria-current', 'location');
    article.classList.add('navigation-highlight');
    // Account for the sticky toolbar, including its height on narrow screens.
    const toolbarHeight = document.querySelector('.topbar').getBoundingClientRect().height;
    article.style.scrollMarginTop = (toolbarHeight + 20) + 'px';
    article.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start', inline: 'nearest'
    });
    $('navigation-status').textContent = `已定位到第 ${index + 1} 条 · ${roleName(item.role)}`;
    highlightTimer = setTimeout(() => article.classList.remove('navigation-highlight'), 2400);
  }

  function applyLayout() {
    readPrefs();
    const landscape = prefs.orientation === 'landscape';
    const sizes = prefs.paper === 'Letter' ? [215.9, 279.4] : [210, 297];
    const [width, height] = landscape ? [sizes[1], sizes[0]] : sizes;
    document.documentElement.style.setProperty('--paper-width', width + 'mm');
    document.documentElement.style.setProperty('--paper-height', height + 'mm');
    document.documentElement.style.setProperty('--image-max-height', (height - 48) + 'mm');
    document.documentElement.style.setProperty('--body-size', prefs.fontSize + 'pt');
    // Values come exclusively from the select allowlists.
    $('page-rules').textContent = `@page { size: ${prefs.paper} ${prefs.orientation}; margin: 16mm 17mm; }`;
    $('paper-label').textContent = `${prefs.paper} · ${landscape ? '横向' : '纵向'}`;
    $('document').classList.toggle('hide-images', !prefs.images);
    $('document-meta').hidden = !prefs.metadata;
    updateSelection();
  }

  function updateTitle() {
    const title = $('title').value.trim() || data?.title || 'ChatGPT 对话';
    $('document-title').textContent = title;
    document.title = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 160);
  }

  function updateSelection() {
    if (!data) return;
    let count = 0;
    for (const item of data.messages) {
      const shown = included(item);
      count += Number(shown);
      articles.get(item.id).hidden = !shown;
      const { row, input, jump } = pickers.get(item.id);
      row.classList.toggle('muted', !matchesScope(item));
      input.checked = selected.has(item.id);
      input.disabled = !matchesScope(item);
      jump.dataset.unavailable = String(!shown);
      jump.title = shown ? '点击定位到这条消息' : (matchesScope(item) ? '勾选后可定位' : '调整消息范围后可定位');
      if (!shown && currentMessage === item.id) {
        clearNavigation();
        $('navigation-status').textContent = '点击文字定位；勾选框决定是否导出。';
      }
    }
    $('count').textContent = `已选 ${count} / ${data.messages.length} 条`;
    $('footer-count').textContent = `${count} 条消息`;
    $('empty-selection').hidden = count > 0;
    $('print').disabled = count === 0 || printing;
  }

  function prepareImages(content) {
    for (const img of content.querySelectorAll('img')) {
      const note = document.createElement('p');
      note.className = 'image-note';
      note.textContent = img.hasAttribute('data-remote-src')
        ? `[图片未加载] ${img.alt}。可在左侧允许加载原图片。`
        : `[图片无法显示] ${img.alt}`;
      note.hidden = !img.hasAttribute('data-remote-src');
      img.after(note);
      img.addEventListener('load', () => { note.hidden = true; img.hidden = false; });
      img.addEventListener('error', () => {
        note.textContent = `[图片加载失败] ${img.alt}。请在原对话中查看。`;
        note.hidden = false; img.hidden = true;
      });
    }
  }

  function updateRemoteImages() {
    for (const img of $('messages').querySelectorAll('img[data-remote-src]')) {
      const note = img.nextElementSibling;
      if ($('remoteImages').checked && prefs.images) {
        if (!img.hasAttribute('src')) {
          note.textContent = `[正在加载图片] ${img.alt}`;
          note.hidden = false;
          img.hidden = false;
          img.src = img.dataset.remoteSrc;
        }
      } else {
        img.removeAttribute('src');
        img.hidden = false;
        note.hidden = false;
        note.textContent = `[图片未加载] ${img.alt}。可在左侧允许加载原图片。`;
      }
    }
  }

  function render(record) {
    clearNavigation();
    data = record;
    selected = new Set(data.messages.map((item) => item.id));
    $('title').disabled = false;
    $('title').value = data.title.slice(0, 200);
    updateTitle();
    const date = new Date(data.capturedAt);
    const time = document.createElement('div');
    time.textContent = `导出时间：${Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false })} · ${data.messages.length} 条已加载消息`;
    const source = document.createElement('a');
    const url = globalThis.ChatPdfSanitize.safeUrl(data.url);
    source.textContent = '来源：' + (url || 'ChatGPT 网页');
    if (url) { source.href = url; source.target = '_blank'; source.rel = 'noopener noreferrer'; }
    $('document-meta').replaceChildren(time, source);
    $('messages').replaceChildren();
    $('message-list').replaceChildren();
    articles.clear(); pickers.clear();
    const output = document.createDocumentFragment();
    const picker = document.createDocumentFragment();
    data.messages.forEach((item, index) => {
      const article = document.createElement('section');
      article.className = 'message'; article.dataset.role = item.role;
      article.id = `preview-message-${index + 1}`;
      const heading = document.createElement('h2'); heading.className = 'message-heading';
      const number = document.createElement('span'); number.className = 'message-index'; number.textContent = String(index + 1).padStart(2, '0');
      heading.append(number, document.createTextNode(roleName(item.role)));
      const content = document.createElement('div'); content.className = 'message-content';
      content.append(globalThis.ChatPdfSanitize.sanitizeHtml(item.html));
      prepareImages(content);
      article.append(heading, content); output.append(article); articles.set(item.id, article);
      const row = document.createElement('div'); row.className = 'message-option';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true;
      input.setAttribute('aria-label', `导出第 ${index + 1} 条，${roleName(item.role)}`);
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'message-jump';
      jump.setAttribute('aria-label', `定位到第 ${index + 1} 条，${roleName(item.role)}`);
      jump.setAttribute('aria-controls', article.id);
      const name = document.createElement('strong'); name.textContent = `${String(index + 1).padStart(2, '0')} / ${roleName(item.role)}`;
      const excerpt = document.createElement('span'); excerpt.textContent = item.text.replace(/\s+/g, ' ').slice(0, 100) || '图片或公式';
      jump.append(name, excerpt); row.append(input, jump); picker.append(row); pickers.set(item.id, { row, input, jump });
      jump.addEventListener('click', () => jumpToMessage(item, index));
      input.addEventListener('change', () => {
        input.checked ? selected.add(item.id) : selected.delete(item.id);
        updateSelection();
      });
    });
    $('messages').append(output); $('message-list').append(picker);
    $('remote-option').hidden = !data.externalImages;
    $('remoteImages').checked = false;
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    $('warnings').replaceChildren(...warnings.map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));
    $('warnings-box').hidden = warnings.length === 0;
    $('warnings-summary').textContent = `${warnings.length} 项读取提示 · 导出前请核对`;
    $('document').hidden = false; $('print-hint').hidden = false;
    const imagesRead = Number.isInteger(data.imageCount) ? `、${data.imageCount} 张图片` : '';
    message(`已读取 ${data.messages.length} 条消息${imagesRead}。仅包含网页已加载的当前分支；长对话请先回到原页面，滚动加载历史消息后重新导出。`);
    applyLayout();
  }

  async function printDocument() {
    if (!data || printing || !data.messages.some(included)) return;
    printing = true; updateSelection();
    const button = $('print'); button.textContent = '正在准备打印…';
    try {
      // Let fonts and enabled images settle, with a bounded wait.
      const images = [...$('messages').querySelectorAll('.message:not([hidden]) img[src]')];
      const pending = prefs.images ? images.filter((img) => !img.complete).map((img) => new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true });
      })) : [];
      const ready = Promise.allSettled([document.fonts.ready, ...pending]);
      await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 4500))]);
      const unavailable = prefs.images ? images.filter((img) => !img.complete || !img.naturalWidth) : [];
      if (unavailable.length) {
        for (const img of unavailable) {
          img.hidden = true;
          const note = img.nextElementSibling;
          if (note?.classList.contains('image-note')) {
            note.hidden = false; note.textContent = `[图片未能及时加载] ${img.alt}。请在原对话中查看。`;
          }
        }
        message(`${unavailable.length} 张图片未能及时加载，文档中已保留文字标记。可取消打印、等待图片加载后重试。`);
      }
      window.print();
    } finally {
      printing = false; button.replaceChildren(document.createTextNode('保存为 PDF '));
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); button.append(arrow);
      updateSelection();
    }
  }

  $('title').addEventListener('input', updateTitle);
  ids.forEach((id) => $(id).addEventListener('change', () => { applyLayout(); updateRemoteImages(); savePrefs(); }));
  $('remoteImages').addEventListener('change', updateRemoteImages);
  $('select-all').addEventListener('click', () => { data?.messages.filter(matchesScope).forEach((item) => selected.add(item.id)); updateSelection(); });
  $('select-none').addEventListener('click', () => { data?.messages.filter(matchesScope).forEach((item) => selected.delete(item.id)); updateSelection(); });
  $('print').addEventListener('click', () => { void printDocument(); });

  function accept(record) {
    if (!record) {
      message('本次预览已失效。请回到 ChatGPT 对话页面，重新点击扩展。', true);
      $('print').disabled = true; $('count').textContent = '预览已失效'; return;
    }
    if (record.status === 'ready') render(record.data);
    else if (record.status === 'error') {
      message(record.error, true); $('print').disabled = true; $('count').textContent = '需要重新读取';
    }
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    if (ext) {
      const stored = (await chrome.storage.local.get('printPreferences')).printPreferences || {};
      for (const id of ids) {
        if (choices[id]?.includes(stored[id]) || (typeof defaults[id] === 'boolean' && typeof stored[id] === 'boolean')) prefs[id] = stored[id];
        if ($(id).type === 'checkbox') $(id).checked = prefs[id]; else $(id).value = prefs[id];
      }
    }
    applyLayout();
    if (params.has('demo')) {
      const script = document.createElement('script'); script.src = 'demo.js';
      script.onload = () => {
        render(globalThis.CHATPDF_DEMO);
        message('这是示例对话，用于体验排版。导出真实聊天时，请在 ChatGPT 网页点击扩展图标。');
      };
      document.head.append(script); return;
    }
    const id = params.get('id');
    if (!ext || !id || !/^[a-z0-9-]{36}$/.test(id)) { accept(null); return; }
    const key = 'capture:' + id;
    let changed = false;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes[key]) { changed = true; accept(changes[key].newValue); }
    });
    const records = await chrome.storage.session.get(key);
    if (!changed) accept(records[key]);
    setTimeout(() => {
      if (!data && !$('notice').classList.contains('error')) message('读取时间较长。请确认原聊天已加载完成；若仍无结果，请关闭此页、刷新原页面后重新点击扩展。', true);
    }, 20000);
  }
  void init().catch(() => { message('预览初始化失败。请关闭此页并重新点击扩展。', true); });
})();
