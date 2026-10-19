# 用本地 registry 验证安装路径

CI 发布前、或 npm 账号被安全冻结时，可以用 [Verdaccio](https://verdaccio.org/) 把「按包名安装」这条真实路径先跑通。
它验证的东西和线上一致：pnpm 从 registry 取 tarball → 写入 `dependencies` → 追加 `dsh.profile.bundles` → bundle patch 生效。

## 1. 起一个本地 registry

```bash
VROOT=/tmp/mdp-verdaccio; rm -rf "$VROOT"; mkdir -p "$VROOT/storage"
cat > "$VROOT/config.yaml" <<'YAML'
storage: /tmp/mdp-verdaccio/storage
auth:
  htpasswd:
    file: /tmp/mdp-verdaccio/htpasswd
    max_users: 20
uplinks: {}
packages:
  '@minonl/*':
    access: $all
    publish: $authenticated
  '**':
    access: $all
    publish: $authenticated
listen: 127.0.0.1:4873
log: { type: stdout, level: warn }
YAML
verdaccio --config "$VROOT/config.yaml" &
```

> `uplinks: {}` = 完全离线，只服务本地发布的包；DSH profile 的其它依赖仍走各自 registry。

## 2. 建用户并发布

```bash
R=http://127.0.0.1:4873
TOKEN=$(curl -s -X PUT "$R/-/user/org.couchdb.user:mdp" \
  -H 'content-type: application/json' \
  -d '{"name":"mdp","password":"Mdp-test-123","email":"mdp@example.com"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

npm publish --registry="$R" --tag beta --access public \
  --//127.0.0.1:4873/:_authToken="$TOKEN"
```

## 3. 让某个 profile 从本地 registry 取该 scope

在 `~/.dsh/profiles/<profile>/.npmrc` 写入：

```
@minonl:registry=http://127.0.0.1:4873
//127.0.0.1:4873/:_authToken=<TOKEN>
```

## 4. 按包名安装并验证

```bash
dsh --profile <profile> --from-default-profile web --dump-config >/dev/null   # 首次创建
dsh plugin --profile <profile> add @minonl/dsh-plugin-markdown-plus@0.1.0-beta.0
dsh --profile <profile> --dump-config | grep -A2 'markdown-plus'   # 条目在位 = patch 生效
```

启动后核对三件事：

| 检查 | 预期 |
|---|---|
| `GET /dsh-markdown-plus/runtime/mermaid.js` | `200`，约 7.7 MB，`text/javascript` |
| `window.__DSH_BOOT__` 里有本插件行 | 存在 `{id, url, rev}` |
| 打开含 mermaid 围栏的文档 | 出图；语法错误时保留源码 + 提示 + 重试 |

## 5. 清理

```bash
lsof -ti :4873 | xargs -r kill -9
rm -rf /tmp/mdp-verdaccio
rm -rf ~/.dsh/profiles/<profile>     # 可选：移除测试 profile
```
