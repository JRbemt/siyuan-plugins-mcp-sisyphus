# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

这是一款为思源笔记打造的 MCP 服务器插件，以「渐进式披露」为设计哲学，将常用能力收敛为 `notebook`、`document`、`block`、`file`、`search`、`tag`、`system` 七个聚合工具。配合「禁止读写 / 只读 / 读写」三级权限模型与高危操作二次确认机制，在简化 AI 调用路径的同时，为你的笔记数据筑起一道安全防线——让自动化更可靠，让权限管理更细腻。

- `notebook`
- `document`
- `block`
- `file`
- `search`
- `tag`
- `system`

每个 tool 通过必填的 `action` 字段分派具体操作，不再直接暴露 41 个 endpoint 风格的 tool 名。

## 功能特性

- 完整覆盖笔记本、文档、块、资源、导出和通知相关的思源 API
- 对外工具面收敛为 7 个聚合 tool，减少模型选错 tool 的概率
- 插件设置仍保留到 action 级别的开关。默认 fallback 配置里，删除类 action 不暴露，移动类 action 仍暴露但必须先确认。
- 支持按笔记本 / 文档查询直属子文档与直属子块
- 支持全文搜索、SQL 查询、标签搜索、反向链接与反向提及查询
- 权限校验会先解析块 / 文档所属笔记本，再决定是否允许读写

## 权限模型

- `write`：允许读写
- `readonly`：只允许读，所有文档/块写操作都应被拒绝
- `none`：禁止所有读写
- `notebook(action="set_permission")` 设置后，会立即影响后续的 `notebook`、`document`、`block` 调用
- AI 做回归时，建议一开始先把 7 个 tool 都预热调用一次，避免中途首次弹授权卡住流程

## 版本时间线

- `v0.1.6`：新增 `search` 聚合 tool，支持全文搜索、SQL 查询、标签搜索、反向链接与反向提及
- `v0.1.5`：对外 MCP 工具面收敛为 4 个聚合 tool，并新增笔记本级权限守卫与高危 action 确认约束
- `v0.1.4`：首次安装插件时自动生成 MCP 配置文件，开箱即可连接客户端
- `v0.1.3`：精简无关配置项，减少干扰，插件行为更聚焦 MCP 能力
- `v0.1.2`：合并 MCP 工具配置入口，支持双路径回退，配置读取更稳定

完整历史请见 [CHANGELOG.md](./CHANGELOG.md)。

## 高危 Action

服务端 instructions 要求在调用以下 action 前先向用户明确说明并等待确认：

- `notebook(action="remove")`
- `notebook(action="set_permission")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`
- `tag(action="remove")`

如果你的 MCP 客户端会展示 instructions，模型应先征得确认再执行。

默认 fallback 配置里，`document(action="move")` 和 `block(action="move")` 依然会出现在工具列表里。它们被启用并不代表可以跳过确认。

## 安装

### 从思源集市安装

1. 打开思源笔记
2. 进入 设置 > 集市
3. 搜索 `SiYuan MCP`
4. 安装并启用插件

### 从源码安装

```bash
git clone https://github.com/your-repo/siyuan-plugins-mcp-sisyphus.git
pnpm install
pnpm run build
pnpm run make-link
```

## MCP 客户端配置

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/绝对路径/SiYuan/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs"]
    }
  }
}
```

路径中的文件夹名必须与 `plugin.json` 的 `name` 一致，即 `siyuan-plugins-mcp-sisyphus`。

OpenClaw / mcporter 用户可参考 [SKILL.md](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/skills/siyuan-mcp-sisyphus/SKILL.md)。

详细 API ↔ MCP 映射文档见：[API_MCP_MAPPING.md](./API_MCP_MAPPING.md)

## Tool 模型

### `notebook`

| Action | 说明 |
|--------|------|
| `list` | 列出所有笔记本 |
| `create` | 创建笔记本（支持传入 `icon`） |
| `open` / `close` | 打开或关闭笔记本 |
| `rename` | 重命名笔记本 |
| `get_conf` / `set_conf` | 获取或设置笔记本配置 |
| `set_icon` | 设置笔记本 emoji 图标 |
| `get_permissions` | 查看所有笔记本的 MCP 权限 |
| `set_permission` | 修改笔记本权限（`write` / `readonly` / `none`） |
| `get_child_docs` | 获取笔记本根目录下的直属子文档 |

### `document`

| Action | 说明 |
|--------|------|
| `create` | 创建文档，支持 Markdown 内容（支持传入 `icon`） |
| `rename` | 重命名文档（按 ID 或存储路径） |
| `remove` | 删除文档（按 ID 或存储路径） |
| `move` | 移动文档（按 ID 或存储路径） |
| `set_icon` | 设置文档/文件夹 emoji 图标 |
| `get_path` | 按文档 ID 获取存储路径 |
| `get_hpath` | 按 ID 或存储路径获取人类可读路径 |
| `get_ids` | 按人类可读路径获取文档 ID |
| `get_child_blocks` | 获取文档的直属子块 |
| `get_child_docs` | 获取文档的直属子文档 |
| `list_tree` | 列出指定笔记本路径下的文档树 |
| `search_docs` | 按标题关键词搜索文档 |
| `get_doc` | 按 ID 获取文档内容与元数据 |
| `create_daily_note` | 为笔记本创建或返回今日日记 |

路径语义：`create` 与 `get_ids` 使用人类可读路径（如 `/Inbox/Weekly Note`）。`rename`、`remove`、`move`、`get_hpath` 支持按 `id` 或 `notebook + 存储路径` 两种形态调用。

### `block`

| Action | 说明 |
|--------|------|
| `insert` / `prepend` / `append` | 插入块到指定位置/开头/末尾 |
| `update` | 更新块内容 |
| `delete` | 删除块 |
| `move` | 移动块到新位置 |
| `fold` / `unfold` | 折叠/展开可折叠块 |
| `get_kramdown` | 获取块的 kramdown 格式内容 |
| `get_children` | 获取直属子块 |
| `transfer_ref` | 转移块引用 |
| `set_attrs` / `get_attrs` | 设置或获取块属性 |
| `exists` | 检查块是否存在 |
| `info` | 获取块所在根文档元数据 |
| `breadcrumb` | 获取块的面包屑路径 |
| `dom` | 获取块的渲染 DOM |
| `recent_updated` | 列出最近更新的块 |
| `word_count` | 获取块的字数统计 |

### `file`

| Action | 说明 |
|--------|------|
| `upload_asset` | 上传资源文件 |
| `render_template` | 使用文档上下文渲染模板 |
| `render_sprig` | 渲染 Sprig 模板 |
| `export_md` | 导出文档为 Markdown |
| `export_resources` | 导出资源为 ZIP 压缩包 |

### `system`

| Action | 说明 |
|--------|------|
| `push_msg` / `push_err_msg` | 推送普通/错误通知消息 |
| `get_version` / `get_current_time` | 获取思源版本号或当前时间 |
| `workspace_info` | 获取思源工作区元数据。高风险：会暴露工作区绝对路径，默认关闭 |
| `network` | 获取脱敏后的网络代理信息 |
| `changelog` | 获取当前版本更新日志 |
| `conf` | 以“先摘要、后深入”的方式获取脱敏后的系统配置 |
| `sys_fonts` | 以“先摘要、后分页”的方式列出系统字体 |
| `boot_progress` | 获取当前启动进度详情 |

标签不是通过单独的创建 action 生成的。请在块的 Markdown 内容里写成 `#标签#`，这样思源才能识别为真正的标签。

### `search`

| Action | 说明 |
|--------|------|
| `fulltext` | 全文搜索 |
| `query_sql` | 执行只读 SQL（仅允许 SELECT / WITH） |
| `search_tag` | 按关键词搜索标签 |
| `get_backlinks` | 查找引用了指定块的文档/块 |
| `get_backmentions` | 查找提及了指定块名称的文档/块 |

### `tag`

| Action | 说明 |
|--------|------|
| `list` | 列出工作区标签 |
| `rename` | 重命名标签 |
| `remove` | 删除标签 |


## 工具开关

在思源中打开 `设置 -> 插件 -> SiYuan MCP sisyphus`。

- 每个聚合 tool 有一个总开关
- 每个 action 仍可单独启用或关闭
- 默认 fallback 配置会暴露移动类 action，但不会暴露删除类 action
- 旧版按 tool 名保存的配置会自动迁移到新格式

## 开发

连接本机 SiYuan 做 live smoke：

```bash
pnpm run build
node scripts/live_mcp_smoke.cjs
```

```text
siyuan-plugins-mcp-sisyphus/
├── src/
│   ├── api/           # 思源 API 封装
│   ├── mcp/           # MCP 服务器实现
│   │   ├── tools/     # 聚合 tool 处理器
│   │   ├── config.ts  # 配置与迁移辅助
│   │   ├── server.ts  # 主服务器
│   │   └── types.ts   # action 级校验
│   └── index.ts       # 插件入口
├── public/i18n/       # 国际化
└── package.json
```

## 许可证

MIT
