# 发布流程

本包通过 **npm Trusted Publishing（OIDC）** 发布：CI 里用短期身份令牌换发布权限，
**不需要长期 token，也不需要手动输入 OTP**。

## 一次性配置（在 npmjs.com 上，人工做一次）

1. 打开 <https://www.npmjs.com/package/@minonl/dsh-plugin-markdown-plus/access>（首次发布前该页面在包创建后出现）
2. 找到 **Trusted Publisher** → **Select your publisher** → **GitHub Actions**
3. 填入（**全部区分大小写，必须完全一致**）：

   | 字段 | 值 |
   |---|---|
   | Organization or user | `minonl` |
   | Repository | `dsh-plugin-markdown-plus` |
   | Workflow filename | `publish.yml` |
   | Environment name | （留空） |
   | Allowed actions | 勾选 **Allow npm publish** |

4. 保存。

> ⚠️ 新建的 Trusted Publisher 配置**必须在 2 天内完成首次成功发布**，否则过期作废。
> ⚠️ `package.json` 的 `repository.url` 必须与仓库完全一致（已配置为 `git+https://github.com/minonl/dsh-plugin-markdown-plus.git`）。

## 每次发版（三步）

```bash
# 1) 改版本（semver）
npm version 0.1.0-beta.1 --no-git-tag-version
git commit -am "chore: v0.1.0-beta.1"

# 2) 打 tag 并推送（tag 必须与 package.json 的 version 完全一致，CI 会校验）
git tag v0.1.0-beta.1
git push origin main --tags

# 3) 等 CI 的 publish 工作流完成
gh run watch
```

工作流自动判定 dist-tag：版本含 `-` → `beta`，否则 `latest`。

## 首次发布（尚无包时）

Trusted Publisher 需要包**已存在于 registry**才能配置。所以**第一次**必须先手动发布一次：

```bash
npm publish --tag beta --access public --otp=<认证器 6 位码>
```

发布成功后在 npmjs 上配置 Trusted Publisher，之后所有版本都走 CI。

## 本地质量闸门

CI 与 `prepublishOnly` 跑同一套：

```bash
bun run typecheck          # 类型
bun test --preload ./test/preload.ts   # 11 用例（DOM 环境）
bun run build              # 三段产物 + 自检
```

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `ENEEDAUTH` | workflow 文件名与 npmjs 配置不一致 | 核对必须是 `publish.yml`（含扩展名） |
| `id-token` 相关失败 | 缺 `id-token: write` | 工作流已配置，勿删 |
| OIDC 被静默跳过、PUT 返回 404 | npm < 11.5.1 | 工作流用 Node 24（npm ≥ 11） |
| tag 校验失败 | tag 与 `package.json` version 不一致 | 让两者一致后重新打 tag |
