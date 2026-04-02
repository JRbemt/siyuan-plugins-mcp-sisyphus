# SiYuan MCP 使用指南

## 快速认知

当前版本不再暴露零散 endpoint 风格 tool，而是统一为 7 个聚合入口：

- `notebook`
- `document`
- `block`
- `file`

调用时统一通过 `action` 指定具体操作。

默认 fallback 配置里，删除类 action 不暴露；`document(action="move")` 和 `block(action="move")` 仍会暴露，但必须先确认。

## 权限约定

- `write`：允许读写
- `readonly`：只允许读，禁止所有文档和块写操作
- `none`：禁止所有读写
- `notebook(action="set_permission")` 修改权限后，后续 `notebook` / `document` / `block` 调用会立即按新权限生效
- 如果让 AI 执行整套回归，建议先对 `notebook`、`document`、`block`、`file` 各做一次低风险调用，提前完成授权预热

## 客户端配置

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

## Action 速查

### `notebook`

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

### `document`

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`

### `block`

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

### `file`

- `upload_asset`
- `render_template`
- `render_sprig`
- `export_md`
- `export_resources`

### `system`

- `push_msg`
- `push_err_msg`
- `get_version`
- `get_current_time`

## 调用示例

### 重命名笔记本

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

### 通过文档 ID 重命名文档

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

### 获取笔记本根目录直属子文档

```json
{
  "name": "notebook",
  "arguments": {
    "action": "get_child_docs",
    "notebook": "20210808180117-czj9bvb"
  }
}
```

### 通过文档 ID 获取直属子块

```json
{
  "name": "document",
  "arguments": {
    "action": "get_child_blocks",
    "id": "20240318112233-abc123"
  }
}
```

### 通过路径移动多个文档

```json
{
  "name": "document",
  "arguments": {
    "action": "move",
    "fromPaths": ["/Inbox/A.sy", "/Inbox/B.sy"],
    "toNotebook": "20210808180117-czj9bvb",
    "toPath": "/Archive"
  }
}
```

### 在父块末尾追加内容

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

如果要创建思源标签，请把 Markdown 写成 `#标签#`，例如：`#假期# #回家# #放松#`。

### 获取思源版本

```json
{
  "name": "system",
  "arguments": {
    "action": "get_version"
  }
}
```

## 参数形态说明

### `document(action="create")`

`create.path` 是人类可读目标路径，例如 `/Inbox/Weekly Note`。它不是 `get_path` 返回的存储路径，而且不会自动创建缺失的父路径。

### `document(action="rename")`

支持两种调用方式：

```json
{
  "action": "rename",
  "id": "20240318112233-abc123",
  "title": "New Title"
}
```

```json
{
  "action": "rename",
  "notebook": "20210808180117-czj9bvb",
  "path": "/20240318112233-abc123.sy",
  "title": "New Title"
}
```

### `document(action="remove")`

支持两种调用方式：

```json
{
  "action": "remove",
  "id": "20240318112233-abc123"
}
```

```json
{
  "action": "remove",
  "notebook": "20210808180117-czj9bvb",
  "path": "/20240318112233-abc123.sy"
}
```

### `document(action="move")`

支持两种调用方式：

```json
{
  "action": "move",
  "fromIDs": ["20240318112233-a", "20240318112233-b"],
  "toID": "20240318112233-parent"
}
```

```json
{
  "action": "move",
  "fromPaths": ["/20240318112233-a.sy", "/20240318112233-b.sy"],
  "toNotebook": "20210808180117-czj9bvb",
  "toPath": "/20240318112233-parent.sy"
}
```

注意：

- `rename`、`remove`、`move`、`get_hpath` 的 `path` / `fromPaths` / `toPath` 是存储路径
- `get_path` 负责把 `id -> 存储路径`
- `get_hpath` 和 `get_ids` 负责在人类可读层级路径与存储路径/ID 之间转换
- `get_child_blocks` 和 `get_child_docs` 都要求传文档 ID，且只返回直属子项

### `block(action="prepend" | "append" | "insert")`

- `prepend` + 文档 ID：插入到文档开头
- `append` + 文档 ID：插入到文档末尾
- `prepend` / `append` + 块 ID：操作该块的子块列表
- `insert`：按 `nextID` / `previousID` 精确定位插入

### `block(action="fold" | "unfold")`

实测应使用可折叠块 ID。直接传文档 ID 会被 SiYuan 拒绝。

## 高危 Action

调用以下 action 前，应先向用户确认：

- `notebook(action="remove")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`

## 设置页

在 `设置 -> 插件 -> SiYuan MCP sisyphus` 中：

- 可以按聚合 tool 总开关启停
- 可以继续细到 action 级别控制
- 默认 fallback 配置会暴露移动类 action，但不会暴露删除类 action
- 旧版配置会自动迁移为新结构
