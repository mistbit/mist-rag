// ============================================================
// RAG 教程站点 · 交互脚本
// 功能：阅读进度条、主题切换（跟随系统）、侧边栏切换、KaTeX/Mermaid 渲染
// ============================================================

(function () {
  // ------------------------------------------------------------
  // 1) 主题切换（浅色/深色，记忆用户选择）
  // ------------------------------------------------------------
  const root = document.documentElement;
  const themeBtn = document.getElementById('themeToggle');
  const iconLight = document.getElementById('iconLight');
  const iconDark = document.getElementById('iconDark');

  const saved = localStorage.getItem('mist-rag-theme');
  const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved || (sysDark ? 'dark' : 'light');
  applyTheme(initial);

  function applyTheme(mode) {
    root.setAttribute('data-theme', mode);
    if (mode === 'dark') {
      iconLight.style.display = 'none';
      iconDark.style.display = 'block';
    } else {
      iconLight.style.display = 'block';
      iconDark.style.display = 'none';
    }
  }

  themeBtn && themeBtn.addEventListener('click', () => {
    const cur = root.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('mist-rag-theme', next);
  });

  // ------------------------------------------------------------
  // 2) 阅读进度条
  // ------------------------------------------------------------
  const progress = document.getElementById('readingProgress');
  function updateProgress() {
    const h = document.documentElement;
    const scrolled = h.scrollTop || document.body.scrollTop;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (scrolled / max) * 100 : 0;
    if (progress) progress.style.width = pct + '%';
  }
  document.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  // ------------------------------------------------------------
  // 3) 侧边栏移动端切换
  // ------------------------------------------------------------
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  toggleBtn && toggleBtn.addEventListener('click', () => {
    sidebar && sidebar.classList.toggle('open');
  });
  // 点击侧边栏链接后自动关闭（移动端）
  sidebar && sidebar.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth < 900) sidebar.classList.remove('open');
    });
  });

  // ------------------------------------------------------------
  // 4) KaTeX 自动渲染（$...$ 与 $$...$$）
  // ------------------------------------------------------------
  function renderMath() {
    if (typeof renderMathInElement === 'function') {
      renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
      });
    } else {
      // 等 KaTeX 加载完成
      setTimeout(renderMath, 100);
    }
  }
  renderMath();

  // ------------------------------------------------------------
  // 5) Mermaid 流程图：把 ```mermaid 代码块转为图
  // ------------------------------------------------------------
  function initMermaid() {
    if (typeof mermaid === 'undefined') {
      setTimeout(initMermaid, 100);
      return;
    }
    const isDark = root.getAttribute('data-theme') === 'dark';
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      themeVariables: { fontFamily: 'Inter, Noto Serif SC, sans-serif' }
    });
    document.querySelectorAll('pre > code.language-mermaid, pre code.language-mermaid').forEach((el, i) => {
      const pre = el.closest('pre');
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = el.textContent;
      div.id = 'mermaid-' + i;
      if (pre) pre.replaceWith(div);
    });
    try { mermaid.run(); } catch (e) { /* ignore */ }
  }
  initMermaid();

  // ------------------------------------------------------------
  // 6) 给代码块添加复制按钮 + 语言标记
  // ------------------------------------------------------------
  document.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;
    const lang = (code.className.match(/language-(\w+)/) || [, ''])[1];
    if (lang) pre.setAttribute('data-lang', lang);

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    btn.style.cssText = `
      position:absolute; top:8px; right:8px;
      background:rgba(255,255,255,0.08); color:#bbb;
      border:1px solid rgba(255,255,255,0.15); border-radius:4px;
      padding:3px 10px; font-size:11px; cursor:pointer;
      transition: all 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,255,255,0.18)';
      btn.style.color = '#fff';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255,255,255,0.08)';
      btn.style.color = '#bbb';
    });
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.textContent = '✓ 已复制';
        setTimeout(() => (btn.textContent = '复制'), 1500);
      } catch {
        btn.textContent = '复制失败';
      }
    });
    pre.appendChild(btn);
  });

  // ------------------------------------------------------------
  // 7) 平滑锚点跳转（顶栏高度补偿已通过 CSS scroll-margin-top 实现）
  // ------------------------------------------------------------
})();
