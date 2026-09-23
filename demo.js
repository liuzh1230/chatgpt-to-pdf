/* Bundled fictional example; never uses a user's conversations. */
globalThis.CHATPDF_DEMO = {
  title: '把一次讨论，留成一份清晰的记录',
  url: 'https://chatgpt.com/',
  capturedAt: '2026-09-23T14:00:00.000Z',
  externalImages: 0,
  warnings: [],
  messages: [
    { id: 'm0', role: 'user', text: '请给我一个学习计划，并保留表格、示例代码和数学公式。', html: '<div class="preserve-lines">请给我一个学习计划，并保留表格、示例代码和数学公式。\n我希望导出的 PDF 可以搜索、复制文字，也方便打印。</div>' },
    { id: 'm1', role: 'assistant', text: '从理解概念，到独立完成一个小项目。下面用一个三阶段计划展示对话导出的排版。', html: '<h2>从理解概念，到完成一个小项目</h2><p>把每次讨论整理成可以回看的记录，有助于连接零散知识。下面是一个示例计划，你可以按自己的节奏调整。</p><table><thead><tr><th>阶段</th><th>学习内容</th><th>完成标志</th></tr></thead><tbody><tr><td>第一阶段</td><td>基础语法与数据结构</td><td>写出一个可运行的练习</td></tr><tr><td>第二阶段</td><td>函数、模块与异常处理</td><td>把重复步骤封装成函数</td></tr><tr><td>第三阶段</td><td>综合实践与复盘</td><td>完成一个小型应用</td></tr></tbody></table><h3>一个简单的代码示例</h3><pre><code>def learning_progress(completed, total):\n    if total &lt;= 0:\n        return 0\n    return round(completed / total * 100, 1)\n\nprint(learning_progress(7, 10))  # 70.0</code></pre><p>完成率可以写成：</p><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>P</mi><mo>=</mo><mfrac><mi>c</mi><mi>n</mi></mfrac><mo>×</mo><mn>100</mn><mo>%</mo></math><blockquote><p>给每个阶段留下一个可以检查的成果，比只记录学习时长更容易复盘。</p></blockquote>' },
    { id: 'm2', role: 'user', text: '如果一条回答很长，会不会在 PDF 中被截断？', html: '<p>如果一条回答很长，会不会在 PDF 中被截断？</p>' },
    { id: 'm3', role: 'assistant', text: '长段落和代码允许跨页，表格重复表头。宽表格可以切换为横向纸张。', html: '<p>普通长段落和代码会自动换行，并允许跨页；表格在分页时重复表头。对于宽表格，可以在左侧把纸张方向改为<strong>横向</strong>。</p><ul><li>用左侧勾选框选择要保留的消息。</li><li>给文档起一个便于查找的标题。</li><li>点击“保存为 PDF”，在打印窗口选择“另存为 PDF”。</li></ul><p>浏览器打印窗口中的预览是最终分页效果。</p>' }
  ]
};
