/* Evaluated in the extension's isolated world; resolves to a complete capture. */
(async () => {
  const { cleanNode, safeUrl } = globalThis.ChatPdfSanitize;
  const warnings = new Set();
  const roleSelector = '[data-message-author-role="user"],[data-message-author-role="assistant"]';
  const modernSelector = '[data-chatgpt-search-unit-key],[data-content-search-unit-key]';
  const turnSelector = '[data-testid^="conversation-turn-"],[data-turn="user"],[data-turn="assistant"],' + modernSelector;
  const scopes = [...document.querySelectorAll('main,[role="main"]')];
  const countMarkers = (scope) => scope.querySelectorAll(roleSelector + ',' + turnSelector).length;
  const main = scopes.sort((a, b) => countMarkers(b) - countMarkers(a))[0] || document;
  // A contents wrapper has no box of its own, although its children are shown.
  // Also check ancestors: display:none on a parent does not change this node's
  // computed display, and a hidden branch must never be included.
  const hidden = (el) => {
    if (!el || el.closest('[hidden],[aria-hidden="true"]')) return true;
    for (let current = el; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.contentVisibility === 'hidden') return true;
    }
    return false;
  };
  const visible = (el) => {
    if (hidden(el)) return false;
    if (el.getClientRects().length) return true;
    return [...el.querySelectorAll('*')].some(child => child.getClientRects().length && !hidden(child)) || [...el.childNodes].some(node => {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false;
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getClientRects().length > 0;
    });
  };
  // Only search outside main when it has no conversation markers at all.
  const scope = countMarkers(main) ? main : document;
  const roleNodes = [...scope.querySelectorAll(roleSelector)];
  const turns = [...scope.querySelectorAll(turnSelector)];
  const modernUnits = [...scope.querySelectorAll(modernSelector)];
  const unitKey = (element) => element.getAttribute('data-chatgpt-search-unit-key') || element.getAttribute('data-content-search-unit-key') || '';
  const unitRole = (element) => /(?:^|:)(user|assistant)$/.exec(unitKey(element))?.[1];
  // The current web app no longer uses data-message-author-role or conversation-
  // turn test IDs. Its search-unit key ends with the explicit speaker role.
  // A user unit includes attachments, then a nested text unit with the same key:
  // keep the outer unit so neither its pictures nor its text are duplicated.
  const roots = modernUnits.filter(element => {
    if (!unitRole(element) || !visible(element)) return false;
    for (let parent = element.parentElement; parent && scope.contains(parent); parent = parent.parentElement) {
      if (parent.matches(modernSelector) && unitKey(parent) === unitKey(element)) return false;
    }
    return true;
  }).map(element => ({ element, role: unitRole(element), modern: true }));
  const modernMessages = roots.length;
  for (const element of roleNodes) {
    if (element.querySelector(roleSelector) || !visible(element)) continue;
    if (roots.some(item => item.element.contains(element) || element.contains(item.element))) continue;
    roots.push({ element, role: element.getAttribute('data-message-author-role') });
  }
  const headingRole = (heading) => {
    const label = heading.textContent.trim();
    if (/^(?:ChatGPT(?: said| says)?|assistant|ChatGPT\s*说(?:道)?)\s*[:：]?$/i.test(label)) return 'assistant';
    if (/^(?:You said|You|user|你说|您说|你|用户)\s*[:：]?$/i.test(label)) return 'user';
    return null;
  };
  let compatibleTurns = 0;
  // Some turns keep author attributes while others use a labelled article.
  // Fill the missing turns even if other messages used the primary selector.
  for (const turn of turns) {
    if (!visible(turn) || roots.some(item => turn.contains(item.element) || item.element.contains(turn))) continue;
    if (turn.querySelector(turnSelector)) continue;
    const label = [...turn.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(heading => !heading.closest('.markdown,[data-markdown-text-style]') && headingRole(heading));
    const turnRole = turn.getAttribute('data-turn');
    const role = ['user', 'assistant'].includes(turnRole) ? turnRole : label && headingRole(label);
    if (!role || !turn.querySelector('.markdown,.whitespace-pre-wrap,[data-message-content],[data-markdown-text-style],img,math')) continue;
    roots.push({ element: turn, role, compatible: true });
    compatibleTurns++;
  }
  roots.sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  if (compatibleTurns) warnings.add('使用兼容模式读取，请核对说话者和消息顺序。');
  let embeddedBytes = 0;
  let externalImages = 0;
  let imageCount = 0;
  const seen = new Set();
  const messages = [];
  const imageCache = new Map();
  const deadline = Date.now() + 14000;
  const limit = 3500000;
  const uiSelector = '[data-testid*="copy"],[data-testid*="voice"],[data-testid*="feedback"],[role="toolbar"],.sr-only';
  const imageIsContent = (img) => visible(img) && !img.closest(uiSelector + ',[data-testid*="avatar"],[data-testid*="favicon"]');

  function rasterize(source, width, height) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1800 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.95);
  }
  async function readPixels(original, src) {
    // Already-visible pixels cost no network request, including blob: images.
    if (original.complete && original.naturalWidth) {
      try { return rasterize(original, original.naturalWidth, original.naturalHeight); } catch { /* cross-origin canvas */ }
    }
    if (Date.now() >= deadline) return '';
    let url;
    try { url = new URL(src, location.href); } catch { return ''; }
    if (!['https:', 'blob:'].includes(url.protocol)) return '';
    // Read only the image URL already in the page. The browser supplies its normal
    // same-origin session; no token/Cookie inspection or private API discovery.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(3500, Math.max(1, deadline - Date.now())));
    try {
      const response = await fetch(url.href, {
        credentials: url.origin === location.origin ? 'same-origin' : 'omit',
        signal: controller.signal, cache: 'force-cache'
      });
      if (!response.ok || response.type === 'opaque') return '';
      if (Number(response.headers.get('content-length')) > 16000000) return '';
      const blob = await response.blob();
      if (blob.size > 16000000 || !/^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(blob.type)) return '';
      const bitmap = await createImageBitmap(blob);
      try { return rasterize(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); }
    } catch { return ''; } finally { clearTimeout(timer); }
  }
  // Galleries may be siblings of the text container. Never use another turn.
  function attachmentScope(root, role) {
    if (role !== 'user') return root;
    const turn = root.closest(turnSelector + ',article');
    if (turn && scope.contains(turn)) {
      const authors = [...turn.querySelectorAll(roleSelector)].filter(el => !el.querySelector(roleSelector));
      if (authors.length === 0 || (authors.length === 1 && authors[0] === root)) return turn;
    }
    let attachment = root;
    for (let i = 0; i < 3; i++) {
      const parent = attachment.parentElement;
      if (!parent || parent === scope || !scope.contains(parent)) break;
      const authors = [...parent.querySelectorAll(roleSelector)].filter(el => !el.querySelector(roleSelector));
      if (authors.length !== 1 || authors[0] !== root) break;
      attachment = parent;
    }
    return attachment;
  }
  for (const item of roots) {
    const { element: root, role } = item;
    const messageId = root.getAttribute('data-message-id') || root.getAttribute('data-chatgpt-selection-message-id') ||
      root.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/\s+/)[0] ||
      root.querySelector('[data-chatgpt-selection-message-id]')?.getAttribute('data-chatgpt-selection-message-id');
    if (messageId && seen.has(messageId)) continue;
    if (messageId) seen.add(messageId);
    // Keep every content block in a message, rather than only its first markdown.
    const body = root;
    const copy = body.cloneNode(true);
    const sourceElements = [...body.querySelectorAll('*')];
    const copiedElements = [...copy.querySelectorAll('*')];
    const pairs = [];
    const originals = [...body.querySelectorAll('img')];
    // Pair before removing controls, otherwise deleted images shift indexes.
    [...copy.querySelectorAll('img')].forEach((clone, index) => {
      const original = originals[index];
      if (imageIsContent(original)) pairs.push({ original, clone }); else clone.remove();
    });
    // Sanitization cannot see the source page's CSS after cloning. Remove CSS
    // hidden branches while the source and clone still have matching indexes.
    sourceElements.forEach((element, index) => {
      if (hidden(element)) copiedElements[index].remove();
    });
    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();
    const attachments = attachmentScope(root, role);
    for (const original of attachments.querySelectorAll('img')) {
      if (body.contains(original) || !imageIsContent(original)) continue;
      const clone = original.cloneNode(false);
      const figure = document.createElement('figure'); figure.append(clone);
      (original.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING ? before : after).append(figure);
      pairs.push({ original, clone });
    }
    const container = document.createElement('div');
    container.append(before, copy, after);
    copy.querySelectorAll(uiSelector).forEach(el => el.remove());
    if (item.compatible) copy.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading => {
      if (!heading.closest('.markdown,[data-markdown-text-style]') && headingRole(heading)) heading.remove();
    });
    // Preserve the picture inside a viewer button, but not its controls.
    copy.querySelectorAll('button').forEach(button => {
      const pictures = [...button.querySelectorAll('img')];
      const fragment = document.createDocumentFragment();
      for (const picture of pictures) fragment.append(picture);
      button.replaceWith(fragment);
    });
    for (const { original, clone } of pairs) {
      if (!container.contains(clone)) continue;
      imageCount++;
      const src = original.currentSrc || original.src || original.getAttribute('src');
      let embedded = '';
      if (src?.startsWith('data:') && safeUrl(src, true)) embedded = src;
      else if (embeddedBytes < limit && src) {
        if (!imageCache.has(src)) imageCache.set(src, readPixels(original, src));
        embedded = await imageCache.get(src);
      }
      clone.removeAttribute('srcset');
      clone.removeAttribute('sizes');
      clone.removeAttribute('loading');
      if (embedded && embeddedBytes + embedded.length <= limit) {
        embeddedBytes += embedded.length;
        clone.setAttribute('src', embedded);
      } else if (safeUrl(src, true) && !src.startsWith('data:')) {
        clone.setAttribute('src', src);
        externalImages++;
      } else {
        const note = document.createElement('p');
        note.textContent = embedded
          ? '[图片超过嵌入容量，请分段导出]'
          : `[图片暂时无法读取：${original.alt || '你发送的图片'}，请先在原聊天中打开图片后重新导出]`;
        clone.replaceWith(note);
        warnings.add(embedded ? '部分图片超过嵌入容量，已保留文字标记。' : '部分图片暂时无法读取，已保留文字标记。请先在原聊天中打开这些图片后重新导出。');
      }
    }
    if (copy.querySelector('canvas,video,audio,iframe')) warnings.add('交互画布、音视频和嵌入页面不包含在导出中；请在原对话中查看。');
    const wrapper = document.createElement('div');
    wrapper.append(cleanNode(container));
    const text = (wrapper.textContent || '').trim();
    if (!text && !wrapper.querySelector('img,math')) continue;
    messages.push({ id: 'm' + messages.length, role, html: wrapper.innerHTML, text });
  }
  if (document.querySelector('[data-testid="stop-button"],[aria-label="Stop generating"],[aria-label="停止生成"]')) {
    warnings.add('回答可能仍在生成，本次只包含读取时已有的内容。建议生成结束后重新导出。');
  }
  if (externalImages) warnings.add(`${externalImages} 张图片未能嵌入。可在左侧允许加载原图片；加载会连接图片原网站，可能需要登录。`);
  const title = document.title.replace(/\s*[-–—|]\s*ChatGPT\s*$/i, '').trim();
  return {
    title: !title || title === 'ChatGPT' ? 'ChatGPT 对话' : title,
    url: location.origin + location.pathname,
    capturedAt: new Date().toISOString(),
    messages, warnings: [...warnings], externalImages, imageCount,
    scope: 'loaded-messages',
    diagnostics: { roleNodes: roleNodes.length, visibleRoleNodes: roleNodes.filter(visible).length, turnNodes: turns.length, compatibleTurns, modernUnitNodes: modernUnits.length, modernMessages }
  };
})();
