# 端到端验证（e2e）

目标：用**真实浏览器 + 真实 Mermaid 引擎 + 真实模块**验证用户可见行为，并**留档截图**。

## 运行

```bash
bun run test:e2e            # 本地：复用系统已装 Edge（不下载浏览器）
E2E_CHANNEL=chromium bun run test:e2e   # CI：用 Playwright 自带 chromium
```

前提：先确保没有占用 5183 端口（脚本会自己拉起 vite dev server，结束后按 PID 精确关闭）。

> ⚠️ 脚本**只启动/关闭自己创建的浏览器实例**，不会影响你正在使用的浏览器。

## 覆盖场景

| 场景 | 断言 |
|---|---|
| Mermaid · 合法图 | 渲染出 SVG（含 `viewBox` 与 `width=100%`） |
| Mermaid · 语法错误 | 降级提示含 `Parse error`，源码保持可见，块状态 `degraded` |
| Mermaid · 非图表块 | 未被处理（无 `data-mdp-state`） |
| Mermaid · 无语言类 | 按首词识别为图表并渲染 |
| TOC · 结构 | 9 个条目、缩进序列 `[8,20,32,32,20,32,32,44,20]` |
| TOC · 点击 | 页面真实滚动 + 对应条目高亮 |
| TOC · scroll spy | 滚到底部后高亮切到靠后条目 |
| TOC · 折叠 | 折叠后列表隐藏 |
| 幂等 | 内容重渲染后仍只有 1 个面板 / 9 个条目 |
| 健康度 | 无控制台错误、无资源加载失败（favicon 除外） |

## 产物

```
artifacts/e2e/<时间戳>/
├── mermaid.png          # 流程图 + 时序图 + 降级提示
├── toc.png              # 大纲面板（视口截图，保证 fixed 面板位置真实）
├── toc-collapsed.png    # 折叠态
└── report.json          # 断言明细 + 控制台/HTTP 错误
```

`artifacts/` 已加入 `.gitignore`；CI 里通过 `actions/upload-artifact` 保留 14 天。

## 为什么不用 jsdom / happy-dom 做这层

mermaid 需要真实布局与测量 API（`getBBox` 等），无头 DOM 里连合法流程图都会解析失败。
happy-dom 只用于**单元测试**（桩运行时）；真实渲染一律走浏览器。
