# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

思源笔记西西弗斯 MCP 服务器。现在对外只暴露 4 个聚合 tool：

- `notebook`
- `document`
- `block`
- `file`

每个 tool 通过必填的 `action` 字段分派具体操作，不再直接暴露 41 个 endpoint 风格的 tool 名。

## 功能特性

- 完整覆盖笔记本、文档、块、资源、导出和通知相关的思源 API
- 对外工具面收缩为 4 个聚合 tool，减少模型选错 tool 的概率
- 插件设置仍保留到 action 级别的开关。默认 fallback 配置里，删除类 action 不暴露，移动类 action 仍暴露但必须先确认。
- 支持按笔记本 / 文档查询直属子文档与直属子块
- 权限校验会先解析块 / 文档所属笔记本，再决定是否允许读写

## 权限模型

- `write`：允许读写
- `readonly`：只允许读，所有文档/块写操作都应被拒绝
- `none`：禁止所有读写
- `notebook(action="set_permission")` 设置后，会立即影响后续的 `notebook`、`document`、`block` 调用
- AI 做回归时，建议一开始先把 4 个 tool 都预热调用一次，避免中途首次弹授权卡住流程

## 版本时间线

- `v0.1.5`：对外 MCP 工具面收敛为 4 个聚合 tool，并新增笔记本级权限守卫与高危 action 确认约束
- `v0.1.4`：首次安装插件时自动生成 MCP 配置文件，开箱即可连接客户端
- `v0.1.3`：精简无关配置项，减少干扰，插件行为更聚焦 MCP 能力
- `v0.1.2`：合并 MCP 工具配置入口，支持双路径回退，配置读取更稳定

完整历史请见 [CHANGELOG.md](./CHANGELOG.md)。

## 高危 Action

服务端 instructions 要求在调用以下 action 前先向用户明确说明并等待确认：

- `notebook(action="remove")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`

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

## Tool 模型

### `notebook`

支持的 action：

- `list`
- `create`
- `open`
- `close`
- `remove`
- `rename`
- `get_conf`
- `set_conf`
- `get_permissions`
- `set_permission`
- `get_child_docs`

示例：

```json
{
  "name": "notebook",
  "arguments": {
    "action": "rename",
    "notebook": "20210808180117-czj9bvb",
    "name": "Research"
  }
}
```

### `document`

支持的 action：

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`

路径语义：

- `create.path` 是人类可读目标路径，例如 `/Inbox/Weekly Note`
- 当 `rename`、`remove`、`move`、`get_hpath` 使用 `notebook + path` 形态时，`path` 是存储路径
- `get_path` 负责把 `id -> 存储路径`
- `get_hpath` 和 `get_ids` 负责在人类可读层级路径与存储路径/ID 之间转换
- `get_child_blocks` 负责按文档 ID 获取直属子块
- `get_child_docs` 负责按文档 ID 获取直属子文档

`create` 不会自动补齐缺失的父路径。更稳妥的做法是在笔记本根路径创建，或只写到已存在的父路径下。

其中 `rename`、`remove`、`move`、`get_hpath` 支持多种参数形态。例如 `rename` 可以使用 `id + title`，也可以使用 `notebook + path + title`。

示例：

```json
{
  "name": "document",
  "arguments": {
    "action": "rename",
    "id": "20240318112233-abc123",
    "title": "Weekly Notes"
  }
}
```

获取笔记本根目录直属子文档：

```json
{
  "name": "notebook",
  "arguments": {
    "action": "get_child_docs",
    "notebook": "20210808180117-czj9bvb"
  }
}
```

### `block`

支持的 action：

- `insert`
- `prepend`
- `append`
- `update`
- `delete`
- `move`
- `fold`
- `unfold`
- `get_kramdown`
- `get_children`
- `transfer_ref`
- `set_attrs`
- `get_attrs`

`prepend` 传文档 ID 时会插入到文档开头，`append` 传文档 ID 时会插入到文档末尾。传块 ID 时，这两个 action 操作的是该块的子块列表。

`fold` 和 `unfold` 应传可折叠块 ID。

示例：

```json
{
  "name": "block",
  "arguments": {
    "action": "append",
    "dataType": "markdown",
    "data": "- New item",
    "parentID": "20240318112233-abc123"
  }
}
```

### `file`

支持的 action：

- `upload_asset`
- `render_template`
- `render_sprig`
- `export_md`
- `export_resources`
- `push_msg`
- `push_err_msg`
- `get_version`
- `get_current_time`

示例：

```json
{
  "name": "file",
  "arguments": {
    "action": "get_version"
  }
}
```

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
