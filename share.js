(() => {
  const input = document.getElementById('share-url');
  const submit = document.getElementById('share-submit');
  const status = document.getElementById('share-status');
  const revoke = document.getElementById('revoke-permission');
  const ext = globalThis.chrome?.runtime?.id && chrome.permissions;
  let busy = false;
  const show = (text, error = false) => { status.textContent = text; status.classList.toggle('error', error); };
  async function updatePermission() {
    if (ext) revoke.hidden = !await chrome.permissions.contains({ origins: ChatPdfShare.origins });
  }
  document.getElementById('share-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    input.removeAttribute('aria-invalid');
    let url;
    try { url = ChatPdfShare.parseShareUrl(input.value); }
    catch (error) { input.setAttribute('aria-invalid', 'true'); show(error.message, true); input.focus(); return; }
    if (!ext) { show('请先安装扩展，再右键工具栏的“对话成册”图标，选择“选项”打开此页面。', true); return; }
    busy = true; submit.disabled = true; input.disabled = true; revoke.disabled = true;
    try {
      // Request immediately inside the user gesture, before any other await.
      const granted = await chrome.permissions.request({ origins: ChatPdfShare.origins });
      if (!granted) { show('未获得分享页访问权限。可以再次点击允许，或打开分享页后用原来的扩展图标导出。', true); return; }
      show('正在打开分享页并等待读取，请保留该页面。加载较慢时可能需要约 90 秒，完成后自动进入 PDF 预览。');
      const result = await chrome.runtime.sendMessage({ type: 'capture-share', url });
      if (!result?.ok) throw new Error(result?.error || '读取未能完成，请重新加载扩展后重试。');
      show('读取流程已结束，请查看打开的 PDF 预览及其中的提示。你也可以继续导出另一条分享链接。');
    } catch (error) { show(error.message || '读取失败，请检查分享页后重试。', true); }
    finally {
      busy = false; submit.disabled = false; input.disabled = false; revoke.disabled = false;
      void updatePermission().catch(() => {});
    }
  });
  revoke.addEventListener('click', async () => {
    if (busy || !ext) return;
    try {
      await chrome.permissions.remove({ origins: ChatPdfShare.origins });
      await updatePermission();
      show('已撤销分享页访问权限。原来的当前聊天导出仍可使用；下次读取链接时会重新申请。');
    } catch { show('暂时无法撤销，请在浏览器扩展管理页调整网站访问权限。', true); }
  });
  if (!ext) show('这是分享链接入口。请安装扩展后，从扩展的“选项”或 PDF 预览页打开。');
  void updatePermission().catch(() => {});
})();
