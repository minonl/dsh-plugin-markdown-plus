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

## 真实 DSH 集成 e2e（`bun run test:e2e:dsh`）

**这条才是「插件是否真的能装上并生效」的门**——它不看源码，而是走用户路径：

```
bun run build → npm pack → 建临时 profile → dsh plugin add <tgz>
→ dsh --profile <tmp> --no-open → Playwright 打开（带 token）
→ 断言：客户端半侧执行 / 无 invalid plugin / TOC 生成 / Mermaid 渲染 / 降级可见
```

| 断言 | 拦截什么 |
|---|---|
| `#mdp/styles` 存在 | 客户端半侧根本没执行（factory 未物化） |
| 无 `invalid plugin` 报错 | 客户端导出不是 Cordis 插件（**缺 `apply`**） |
| 出现 `[data-mdp-toc]` 且条目 ≥3 | 文档级模块在真实宿主里不起作用 |
| 出现 `.mdp-figure svg` | 宿主路由/引擎加载链路断 |
| 坏语法有降级提示且源码可见 | 降级契约回归 |

环境变量：

| 变量 | 用途 |
|---|---|
| `MDP_DSH_PORT` | dsh web 端口（默认 3080；被占用会**直接失败**，不复用也不杀别人实例） |
| `MDP_TGZ` | 复用已有 tarball，跳过 build+pack |
| `E2E_CHANNEL` | 本地默认 `msedge`（复用系统 Edge），CI 用 `chromium` |
| `DSH_HOME` | 覆盖 profile 根目录 |

产物：`artifacts/e2e-dsh/<时间戳>/{app.png,toc.png,mermaid.png,report.json}`；失败时额外出 `failure.png`。

> 反向验证过：把 default export 上的 `apply` 去掉后，这条 e2e 会精确复现
> `invalid plugin, expect function or object with an "apply" method, received object` 并 fail。
