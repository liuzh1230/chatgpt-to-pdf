/* Transform only the detached capture copy. Never change the source page or
 * original toolbar path. capture.js destructures this wrapper for one capture. */
(() => {
  const original = globalThis.ChatPdfSanitize;
  const warnings = new Set();
  globalThis.ChatPdfShareMathWarnings = warnings;
  globalThis.ChatPdfSanitize = {
    ...original,
    cleanNode(node, target = document, inMath = false) {
      const formulas = [...node.querySelectorAll('[data-math-source]')];
      for (const formula of formulas) {
        if (formula.querySelector('math')) continue;
        const source = formula.getAttribute('data-math-source');
        if (!source) continue;
        const fallback = () => {
          const code = target.createElement('code'); code.textContent = source;
          formula.replaceChildren(code);
          warnings.add('部分公式无法转换为数学排版，已完整保留公式源码，请核对。');
        };
        if (source.length > 12000) { fallback(); continue; }
        try {
          const displayMode = !!formula.querySelector('.katex-display');
          const markup = katex.renderToString(source, { output: 'mathml', displayMode, trust: false, strict: 'ignore', throwOnError: true, maxExpand: 1000, maxSize: 20 });
          const template = target.createElement('template'); template.innerHTML = markup;
          const math = template.content.querySelector('math');
          if (math) formula.replaceChildren(math); else fallback();
        } catch { fallback(); }
      }
      return original.cleanNode(node, target, inMath);
    }
  };
})();
