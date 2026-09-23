/* Rebuild allowed document elements. Never copy arbitrary HTML attributes/styles. */
(() => {
  const HTML_TAGS = new Set('p div span br hr strong b em i u s del mark small sub sup h1 h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote pre code table thead tbody tfoot tr th td caption a img figure figcaption details summary'.split(' '));
  const MATH_TAGS = new Set('math semantics annotation mrow mi mn mo mtext mspace ms mfrac msqrt mroot mstyle mpadded mphantom mfenced menclose msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mtd mlabeledtr'.split(' '));
  const DROP = new Set('script style iframe object embed form input textarea select button nav header footer noscript template link meta base svg canvas video audio source'.split(' '));
  const MATH_ATTRS = new Set('display mathvariant mathsize mathcolor stretchy fence separator symmetric largeop movablelimits accent accentunder columnalign rowalign columnspacing rowspacing columnspan rowspan linethickness notation open close separators encoding lspace rspace width height depth voffset'.split(' '));
  const MATH_NS = 'http://www.w3.org/1998/Math/MathML';
  function safeUrl(raw, image = false) {
    if (!raw) return '';
    if (image && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
    try {
      const url = new URL(raw, 'https://chatgpt.com');
      if ((image ? ['https:'] : ['https:', 'http:', 'mailto:']).includes(url.protocol)) return url.href;
    } catch { /* unsafe URL */ }
    return '';
  }
  function cleanNode(node, target = document, inMath = false) {
    if (node.nodeType === Node.TEXT_NODE) return target.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return target.createDocumentFragment();
    const tag = node.localName.toLowerCase();
    const empty = () => target.createDocumentFragment();
    if (DROP.has(tag) || node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return empty();
    if (node.classList.contains('katex-html')) return empty();
    if (node.classList.contains('katex')) {
      const math = node.querySelector('math');
      if (math) return cleanNode(math, target, true);
      const fallback = target.createElement('code');
      fallback.textContent = node.querySelector('annotation')?.textContent || node.textContent;
      return fallback;
    }
    const math = tag === 'math' || inMath;
    if (math && !MATH_TAGS.has(tag)) return empty();
    if (!math && !HTML_TAGS.has(tag)) {
      const fragment = empty();
      for (const child of node.childNodes) fragment.append(cleanNode(child, target, false));
      return fragment;
    }
    if (tag === 'pre') {
      const pre = target.createElement('pre');
      const code = target.createElement('code');
      // Modern ChatGPT may put a toolbar inside the pre wrapper.
      const source = node.querySelector('code');
      if (source) code.textContent = source.textContent;
      else {
        const copy = node.cloneNode(true);
        copy.querySelectorAll('button,[role="button"],svg').forEach((el) => el.remove());
        code.textContent = copy.textContent;
      }
      pre.append(code);
      return pre;
    }
    const el = math ? target.createElementNS(MATH_NS, tag) : target.createElement(tag);
    if (math) {
      for (const attr of node.attributes) if (MATH_ATTRS.has(attr.name)) el.setAttribute(attr.name, attr.value);
    } else {
      const dir = node.getAttribute('dir');
      if (['rtl', 'ltr', 'auto'].includes(dir)) el.setAttribute('dir', dir);
      if (tag === 'a') {
        const href = safeUrl(node.getAttribute('href'));
        if (href) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener noreferrer'); el.setAttribute('target', '_blank'); }
      }
      if (tag === 'img') {
        const raw = node.getAttribute('data-remote-src') || node.getAttribute('src');
        const src = safeUrl(raw, true);
        if (!src) return empty();
        // Remote images require an explicit opt-in in preview.
        if (src.startsWith('data:')) el.setAttribute('src', src);
        else el.setAttribute('data-remote-src', src);
        el.setAttribute('alt', node.getAttribute('alt') || '聊天中的图片');
        el.setAttribute('referrerpolicy', 'no-referrer');
      }
      if (['td', 'th'].includes(tag)) {
        for (const attr of ['colspan', 'rowspan']) {
          const value = Number(node.getAttribute(attr));
          if (Number.isInteger(value) && value >= 1 && value <= 100) el.setAttribute(attr, String(value));
        }
      }
      if (['ol', 'li'].includes(tag)) {
        const attr = tag === 'ol' ? 'start' : 'value';
        if (/^-?\d{1,6}$/.test(node.getAttribute(attr) || '')) el.setAttribute(attr, node.getAttribute(attr));
      }
      if (tag === 'details') el.setAttribute('open', '');
      if (node.classList.contains('whitespace-pre-wrap')) el.classList.add('preserve-lines');
      if (node.classList.contains('preserve-lines')) el.classList.add('preserve-lines');
    }
    for (const child of node.childNodes) el.append(cleanNode(child, target, math));
    return el;
  }
  function sanitizeHtml(html, target = document) {
    // Template contents are inert: images and other resources do not load here.
    const template = target.createElement('template');
    template.innerHTML = String(html || '');
    const fragment = target.createDocumentFragment();
    for (const node of template.content.childNodes) fragment.append(cleanNode(node, target));
    return fragment;
  }
  globalThis.ChatPdfSanitize = { cleanNode, sanitizeHtml, safeUrl };
})();
