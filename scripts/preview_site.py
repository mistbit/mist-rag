#!/usr/bin/env python3
"""
本地教程站点预览服务器（Jinja2 版）
=======================================

为什么需要它？
  GitHub Pages 用 Jekyll 渲染，但本地装 Jekyll 需要 Ruby 环境。
  这个脚本用 Jinja2 渲染一个等价的预览模板，与 _layouts/default.html
  视觉上保持一致，但实现更简单可靠。

依赖（已通过 .venv 安装）：
  pip install markdown pyyaml jinja2

运行：
  .venv/bin/python scripts/preview_site.py
  浏览器打开 http://localhost:8000
"""

from __future__ import annotations

import os
import re
import sys
import http.server
import socketserver
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Tuple

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
PORT = 8000

try:
    import yaml
    import markdown as md_lib
    from jinja2 import Environment, FileSystemLoader, select_autoescape
except ImportError:
    print("❌ 缺少依赖，请运行：pip3 install markdown pyyaml jinja2")
    sys.exit(1)


# ---------- 加载站点配置 ----------
def load_config() -> Dict[str, Any]:
    cfg = yaml.safe_load((ROOT / "_config.yml").read_text(encoding="utf-8"))
    cfg["baseurl"] = ""
    cfg["url"] = ""
    return cfg


# ---------- Front-matter ----------
FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


def parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    m = FM_RE.match(text)
    if not m:
        return {}, text
    fm = yaml.safe_load(m.group(1)) or {}
    return fm, m.group(2)


# ---------- Markdown ----------
def render_markdown(text: str) -> str:
    return md_lib.markdown(
        text,
        extensions=[
            "fenced_code",
            "tables",
            "toc",
            "sane_lists",
            "attr_list",
        ],
    )


# ---------- Jinja2 环境 ----------
ENV = Environment(
    loader=FileSystemLoader(str(SCRIPTS)),
    autoescape=select_autoescape(default_for_string=False, default=False),
    trim_blocks=True,
    lstrip_blocks=True,
)
TEMPLATE = ENV.get_template("_preview_template.html")


# ---------- HTTP Handler ----------
class Handler(http.server.SimpleHTTPRequestHandler):
    cfg: Dict[str, Any] = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write("[preview] " + fmt % args + "\n")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        # 主页
        if path in ("/", "/index.html"):
            return self._serve_md(ROOT / "index.md", "/")

        # markdown 路径映射：/foo.html → ROOT/foo.md
        if path.endswith(".html"):
            md_path = ROOT / (path.lstrip("/").removesuffix(".html") + ".md")
            if md_path.exists():
                return self._serve_md(md_path, path)

        # 静态文件
        return super().do_GET()

    def _serve_md(self, md_path: Path, url: str):
        text = md_path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        content_html = render_markdown(body)

        full_html = TEMPLATE.render(
            site_title=self.cfg.get("title", "RAG 引擎"),
            site_description=self.cfg.get("description", ""),
            navigation=self.cfg.get("navigation", []) or [],
            current_url=url,
            page_title=meta.get("title", ""),
            page_description=meta.get("description", ""),
            page_section=meta.get("section", ""),
            content_html=content_html,
        )

        encoded = full_html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main():
    Handler.cfg = load_config()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"📖 教程站点本地预览已启动")
        print(f"   ➜  http://localhost:{PORT}")
        print(f"   ➜  Ctrl+C 退出")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 已停止")


if __name__ == "__main__":
    main()
