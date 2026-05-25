/* ============================================================
 * mist-rag · v0.3+ Playground · app.js
 *
 * 职责：
 *   1. 启动时拉 /api/health + /api/config，渲染顶部状态条
 *   2. 配置抽屉 open/close + 提交 POST /api/config
 *   3. 4 个 Tab 表单 submit handler:
 *        - compare  : 同步 /api/mock + /api/chat(use_context=true)
 *        - hallu    : /api/chat(use_context=false) + /api/chat(true)
 *        - usage    : 按行串行调 /api/chat(true)，逐行刷新 + 累计 summary
 *        - stream   : POST /api/chat/stream + ReadableStream 解析 SSE
 *   4. 渲染 RetrievedDoc 卡片 / ChatStats 摘要
 *
 * 没有依赖任何第三方 JS，整个文件就是一份 vanilla ES2020。
 * ============================================================ */

"use strict";

// -------------------- 小工具 --------------------

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

async function fetchJSON(url, opts = {}) {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  let data = null;
  try { data = await resp.json(); } catch (_) { /* ignore */ }
  if (!resp.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.payload = data;
    throw err;
  }
  return data;
}

function fmtNum(n) {
  if (n === null || n === undefined) return "—";
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return Number(n).toFixed(4);
}

function fmtCost(cny) {
  if (cny === null || cny === undefined) return "—";
  return `¥${Number(cny).toFixed(6)}`;
}

function fmtElapsed(sec) {
  if (sec === null || sec === undefined) return "—";
  return `${Number(sec).toFixed(2)}s`;
}

// -------------------- 顶部状态条 --------------------

async function refreshStatusBar() {
  const bar = $("#status-bar");
  bar.innerHTML = `<span class="pill">加载中…</span>`;

  try {
    const [health, cfg] = await Promise.all([
      fetchJSON("/api/health"),
      fetchJSON("/api/config"),
    ]);
    const keyPill = cfg.has_key
      ? `<span class="pill ok">🔑 已配置 ${escapeHtml(cfg.key_masked)}</span>`
      : `<span class="pill warn">🔑 未配置 Key</span>`;
    bar.innerHTML = [
      keyPill,
      `<span class="pill brand">🤖 ${escapeHtml(cfg.model)}</span>`,
      `<span class="pill">🔌 ${escapeHtml(cfg.base_url)}</span>`,
      `<span class="pill ok">📚 ${health.doc_count} docs</span>`,
      `<span class="pill">📐 dim=${health.embedding_dim}</span>`,
    ].join("");

    $("#cfg-key-status").textContent = cfg.has_key
      ? `当前：${cfg.key_masked}`
      : "尚未配置";
    $("#cfg-base").placeholder  = cfg.base_url || "https://api.xiaomimimo.com/v1";
    $("#cfg-model").placeholder = cfg.model || "mimo-v2.5-pro";

    return cfg;
  } catch (e) {
    bar.innerHTML = `<span class="pill err">❌ 后端不可达：${escapeHtml(e.message)}</span>`;
    return null;
  }
}

// -------------------- 配置抽屉 --------------------

function bindConfigDrawer() {
  const panel = $("#cfg-panel");
  const open  = () => { panel.classList.remove("hidden"); $("#cfg-key").focus(); };
  const close = () => { panel.classList.add("hidden"); $("#cfg-msg").textContent = ""; };

  $("#btn-config").addEventListener("click", open);
  $("#btn-cfg-close").addEventListener("click", close);
  $("#btn-cfg-cancel").addEventListener("click", close);
  panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.classList.contains("hidden")) close();
  });

  $("#cfg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#cfg-msg");
    msg.className = "cfg-msg";
    msg.textContent = "保存中…";

    const payload = {};
    const k = $("#cfg-key").value.trim();
    const b = $("#cfg-base").value.trim();
    const m = $("#cfg-model").value.trim();
    if (k) payload.api_key = k;
    if (b) payload.base_url = b;
    if (m) payload.model = m;

    if (Object.keys(payload).length === 0) {
      msg.className = "cfg-msg err";
      msg.textContent = "至少填一项再保存。";
      return;
    }

    try {
      await fetchJSON("/api/config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      msg.className = "cfg-msg ok";
      msg.textContent = "✅ 已写入 .env 并即刻生效";
      $("#cfg-key").value = "";
      await refreshStatusBar();
      setTimeout(close, 800);
    } catch (err) {
      msg.className = "cfg-msg err";
      msg.textContent = `❌ ${err.message}`;
    }
  });
}

// -------------------- Tab 切换 --------------------

function bindTabs() {
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.tab;
      $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${id}`));
    });
  });
}

// -------------------- 通用渲染 --------------------

function renderRetrieved(container, docs) {
  if (!docs || docs.length === 0) {
    container.innerHTML = `<div class="retr-empty">未召回任何文档（可能 query 与库无关）</div>`;
    return;
  }
  const html = docs.map((d) => {
    const pct = Math.max(0, Math.min(100, d.similarity * 100)).toFixed(1);
    return `
      <div class="retr-item">
        <div class="retr-item-head">
          <span class="retr-id">${escapeHtml(d.doc_id)}</span>
          <div class="retr-bar"><div class="retr-bar-fill" style="width:${pct}%"></div></div>
          <span class="retr-sim">sim=${d.similarity.toFixed(4)}</span>
        </div>
        <div class="retr-text">${escapeHtml(d.text)}</div>
      </div>
    `;
  }).join("");
  container.innerHTML = `<div class="retr-list">${html}</div>`;
}

function renderStatsLine(stats) {
  if (!stats) return "—";
  return [
    `prompt=${stats.prompt_tokens}`,
    `comp=${stats.completion_tokens}` + (stats.reasoning_tokens ? `(reason ${stats.reasoning_tokens})` : ""),
    `cost=${fmtCost(stats.cost_cny)}`,
    `${fmtElapsed(stats.elapsed_sec)}`,
  ].join(" · ");
}

function setBody(el, text, klass = "") {
  el.className = "card-body" + (klass ? ` ${klass}` : "");
  el.textContent = text;
}

function setError(el, err) {
  el.className = "card-body is-error";
  const status = err.status ? `[${err.status}] ` : "";
  el.textContent = `${status}${err.message}`;
}

// -------------------- Tab: Compare --------------------

function bindCompareTab() {
  const form = $('form[data-form="compare"]');
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = form.elements.query.value.trim();
    if (!query) return;

    const elMock     = $('[data-out="compare-mock"]');
    const elLLM      = $('[data-out="compare-llm"]');
    const elLLMStats = $('[data-out="compare-llm-stats"]');
    const elRetr     = $('[data-out="compare-retr"]');

    setBody(elMock, "调用中…", "is-loading");
    setBody(elLLM,  "调用中…", "is-loading");
    elLLMStats.textContent = "";
    elRetr.innerHTML = "";

    const mockP = fetchJSON("/api/mock", {
      method: "POST",
      body: JSON.stringify({ query, top_k: 3 }),
    });
    const llmP = fetchJSON("/api/chat", {
      method: "POST",
      body: JSON.stringify({ query, top_k: 3, use_context: true }),
    });

    try {
      const mockRes = await mockP;
      setBody(elMock, mockRes.answer);
      renderRetrieved(elRetr, mockRes.retrieved);
    } catch (err) {
      setError(elMock, err);
    }

    try {
      const llmRes = await llmP;
      setBody(elLLM, llmRes.answer);
      elLLMStats.textContent = renderStatsLine(llmRes.stats);
      renderRetrieved(elRetr, llmRes.retrieved); // 真模型一般更准，刷一次
    } catch (err) {
      setError(elLLM, err);
    }
  });
}

// -------------------- Tab: Hallucination --------------------

function bindHallucinationTab() {
  const form = $('form[data-form="hallucination"]');
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = form.elements.query.value.trim();
    if (!query) return;

    const elBare    = $('[data-out="hall-bare"]');
    const elBareSt  = $('[data-out="hall-bare-stats"]');
    const elRag     = $('[data-out="hall-rag"]');
    const elRagSt   = $('[data-out="hall-rag-stats"]');
    const elRetr    = $('[data-out="hall-retr"]');

    setBody(elBare, "调用中…", "is-loading");
    setBody(elRag,  "调用中…", "is-loading");
    elBareSt.textContent = "";
    elRagSt.textContent  = "";
    elRetr.innerHTML = "";

    const bareP = fetchJSON("/api/chat", {
      method: "POST",
      body: JSON.stringify({ query, top_k: 3, use_context: false }),
    });
    const ragP = fetchJSON("/api/chat", {
      method: "POST",
      body: JSON.stringify({ query, top_k: 3, use_context: true }),
    });

    try {
      const r = await bareP;
      setBody(elBare, r.answer);
      elBareSt.textContent = renderStatsLine(r.stats);
    } catch (err) {
      setError(elBare, err);
    }

    try {
      const r = await ragP;
      setBody(elRag, r.answer);
      elRagSt.textContent = renderStatsLine(r.stats);
      renderRetrieved(elRetr, r.retrieved);
    } catch (err) {
      setError(elRag, err);
    }
  });
}

// -------------------- Tab: Usage --------------------

function bindUsageTab() {
  const form = $('form[data-form="usage"]');
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = form.elements.queries.value || "";
    const queries = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (queries.length === 0) return;

    const tableEl   = $('[data-out="usage-table"]');
    const summaryEl = $('[data-out="usage-summary"]');
    summaryEl.innerHTML = "";

    const headHTML = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>query</th>
            <th class="num">prompt</th>
            <th class="num">comp</th>
            <th class="num">reason</th>
            <th class="num">cost (¥)</th>
            <th class="num">耗时</th>
            <th>answer</th>
          </tr>
        </thead>
        <tbody id="usage-tbody"></tbody>
      </table>
    `;
    tableEl.innerHTML = headHTML;
    const tbody = $("#usage-tbody", tableEl);

    queries.forEach((q, i) => {
      const tr = document.createElement("tr");
      tr.className = "is-loading";
      tr.innerHTML = `
        <td class="num">${i + 1}</td>
        <td class="q">${escapeHtml(q)}</td>
        <td class="num">…</td>
        <td class="num">…</td>
        <td class="num">…</td>
        <td class="num">…</td>
        <td class="num">…</td>
        <td class="ans">调用中…</td>
      `;
      tbody.appendChild(tr);
    });

    let totPrompt = 0, totComp = 0, totReason = 0, totCost = 0, totSec = 0, ok = 0;
    const rows = $$("#usage-tbody tr", tableEl);

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const tr = rows[i];
      try {
        const r = await fetchJSON("/api/chat", {
          method: "POST",
          body: JSON.stringify({ query: q, top_k: 3, use_context: true }),
        });
        const s = r.stats;
        totPrompt += s.prompt_tokens;
        totComp   += s.completion_tokens;
        totReason += s.reasoning_tokens;
        totCost   += s.cost_cny;
        totSec    += s.elapsed_sec;
        ok += 1;
        tr.className = "";
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td class="q">${escapeHtml(q)}</td>
          <td class="num">${fmtNum(s.prompt_tokens)}</td>
          <td class="num">${fmtNum(s.completion_tokens)}</td>
          <td class="num">${fmtNum(s.reasoning_tokens)}</td>
          <td class="num">${Number(s.cost_cny).toFixed(6)}</td>
          <td class="num">${fmtElapsed(s.elapsed_sec)}</td>
          <td class="ans">${escapeHtml(r.answer)}</td>
        `;
      } catch (err) {
        tr.className = "is-error";
        tr.innerHTML = `
          <td class="num">${i + 1}</td>
          <td class="q">${escapeHtml(q)}</td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="ans">${escapeHtml((err.status ? `[${err.status}] ` : "") + err.message)}</td>
        `;
      }

      summaryEl.innerHTML = `
        <span>已完成 <b>${ok}/${queries.length}</b></span>
        <span>Σ prompt <b>${fmtNum(totPrompt)}</b></span>
        <span>Σ comp <b>${fmtNum(totComp)}</b></span>
        <span>Σ reason <b>${fmtNum(totReason)}</b></span>
        <span>Σ cost <b>¥${totCost.toFixed(6)}</b></span>
        <span>Σ 耗时 <b>${totSec.toFixed(2)}s</b></span>
      `;
    }
  });
}

// -------------------- Tab: Stream（SSE over POST） --------------------

async function* iterSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      let data = null;
      try { data = JSON.parse(dataLines.join("\n")); } catch (_) { data = dataLines.join("\n"); }
      yield { event, data };
    }
  }
}

function bindStreamTab() {
  const form = $('form[data-form="stream"]');
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = form.elements.query.value.trim();
    if (!query) return;

    const elOut   = $('[data-out="stream-out"]');
    const elStats = $('[data-out="stream-stats"]');
    const elRetr  = $('[data-out="stream-retr"]');

    elOut.className = "card-body card-body-stream";
    elOut.innerHTML = '<span class="text-buf"></span><span class="cursor">█</span>';
    const buf = $(".text-buf", elOut);
    elStats.textContent = "streaming…";
    elRetr.innerHTML = "";

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
      const resp = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 3, use_context: true }),
      });
      if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          if (j && j.detail) detail = j.detail;
        } catch (_) { /* ignore */ }
        throw new Error(detail);
      }

      let acc = "";
      for await (const evt of iterSSE(resp)) {
        if (evt.event === "retrieved") {
          renderRetrieved(elRetr, evt.data.results || []);
        } else if (evt.event === "delta") {
          acc += evt.data.content || "";
          buf.textContent = acc;
        } else if (evt.event === "done") {
          elStats.textContent = renderStatsLine(evt.data && evt.data.stats);
        } else if (evt.event === "error") {
          throw new Error(evt.data && evt.data.message || "stream error");
        }
      }

      const cur = $(".cursor", elOut);
      if (cur) cur.remove();
      if (!acc) {
        elOut.className = "card-body is-error";
        elOut.textContent = "(空响应)";
      }
    } catch (err) {
      elOut.className = "card-body is-error";
      elOut.textContent = (err.status ? `[${err.status}] ` : "") + err.message;
      elStats.textContent = "";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// -------------------- 启动 --------------------

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindConfigDrawer();
  bindCompareTab();
  bindHallucinationTab();
  bindUsageTab();
  bindStreamTab();
  refreshStatusBar();
});
