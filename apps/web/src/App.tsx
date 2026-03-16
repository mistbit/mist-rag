import { useEffect, useState } from "react";
import type { RagOverview } from "@mist-rag/shared";
import fallbackOverview from "@mist-rag/data";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function App() {
  const [overview, setOverview] = useState<RagOverview>(fallbackOverview as RagOverview);
  const [status, setStatus] = useState<"loading" | "online" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/overview`);
        if (!response.ok) {
          throw new Error(`Unexpected status ${response.status}`);
        }

        const data = (await response.json()) as RagOverview;
        if (!cancelled) {
          setOverview(data);
          setStatus("online");
        }
      } catch {
        if (!cancelled) {
          setOverview(fallbackOverview as RagOverview);
          setStatus("fallback");
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero__copy">
          <span className={`status-pill status-pill--${status}`}>
            {status === "online" ? "API online" : status === "fallback" ? "Using local dataset" : "Loading"}
          </span>
          <p className="eyebrow">Sprint 1 / Visual learning shell</p>
          <h1>{overview.hero.title}</h1>
          <p className="hero__subtitle">{overview.hero.subtitle}</p>
        </div>

        <div className="hero__panel">
          <h2>当前交付边界</h2>
          <ul>
            <li>Web 首页先把 RAG 全链路拆开可视化</li>
            <li>API 提供总览数据与健康检查</li>
            <li>共享类型定义为后续 engine 与 UI 对齐</li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__heading">
          <p className="eyebrow">RAG pipeline</p>
          <h2>从文档到答案的 6 个可观察节点</h2>
        </div>
        <div className="flow-grid">
          {overview.flow.map((node, index) => (
            <article key={node.id} className="flow-card">
              <div className="flow-card__header">
                <span className="flow-card__index">{String(index + 1).padStart(2, "0")}</span>
                <h3>{node.title}</h3>
              </div>
              <p>{node.summary}</p>
              <dl>
                <div>
                  <dt>学习重点</dt>
                  <dd>{node.learningFocus}</dd>
                </div>
                <div>
                  <dt>阶段输出</dt>
                  <dd>{node.output}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--split">
        <div>
          <div className="section__heading">
            <p className="eyebrow">Glossary</p>
            <h2>第一批术语卡片</h2>
          </div>
          <div className="glossary-list">
            {overview.glossary.map((item) => (
              <article key={item.term} className="glossary-card">
                <h3>{item.term}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="section__heading">
            <p className="eyebrow">Execution</p>
            <h2>Sprint 1 交付清单</h2>
          </div>
          <div className="milestone-list">
            {overview.sprintOne.map((milestone) => (
              <article key={milestone.name} className="milestone-card">
                <h3>{milestone.name}</h3>
                <p>{milestone.goal}</p>
                <ul>
                  {milestone.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
