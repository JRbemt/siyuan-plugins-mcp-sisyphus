# SiYuan API 与 MCP 映射说明

本文档用于记录：本插件如何把思源的 HTTP API 映射为 MCP 的聚合 tool / action，包括默认端口、认证方式、权限规则、确认规则，以及每个 action 对应的实际接口。

## 总览

### 思源 HTTP API

- 默认地址：`http://127.0.0.1:6806`
- 默认端口：`6806`
- 常见接口形式：`POST /api/<模块>/<方法>`
- 存在 token 时的认证头：
  - `Authorization: Token <token>`

### 本插件暴露的 MCP 工具

- `notebook`
- `document`
- `block`
- `file`
- `search`
- `tag`
- `system`

### 关键源码位置

- 思源 HTTP 客户端：`src/api/client.ts`
- MCP 服务入口：`src/mcp/server.ts`
- tool / action 配置：`src/mcp/config.ts`
- action 参数校验：`src/mcp/types.ts`
- MCP tool 处理器：`src/mcp/tools/`
- HTTP wrapper：`src/api/`

## 运行时入口

### 思源侧接口入口

- 基础 URL：`http://127.0.0.1:6806`
- token 获取：
  - `POST /api/system/getApiToken`
- 插件配置读写：
  - `POST /api/file/getFile`
  - `POST /api/file/putFile`

### 插件自身持久化位置

- MCP 工具配置：
  - `/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig`
- 笔记本权限存储：
  - plugin storage key：`notebookPermissions`

## 权限与确认规则

### 笔记本权限模型

- `rwd`：允许读写删
- `rw`：允许读写，不允许删除
- `r`：只允许读
- `none`：禁止读写删

### 需要用户显式确认的高危 action

- `notebook(action="remove")`
- `notebook(action="set_permission")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`
- `tag(action="remove")`

### 只读工具

- `system` 设计为只读工具

## 映射表

## `notebook`

| MCP action | 思源 HTTP API | Wrapper | 说明 |
|---|---|---|---|
| `list` | `POST /api/notebook/lsNotebooks` | `src/api/notebook.ts` | 列出所有笔记本 |
| `create` | `POST /api/notebook/createNotebook` | `src/api/notebook.ts` | 支持额外传 `icon`，图标通过第二次调用设置 |
| `open` | `POST /api/notebook/openNotebook` | `src/api/notebook.ts` | 需要笔记本读权限 |
| `close` | `POST /api/notebook/closeNotebook` | `src/api/notebook.ts` | 需要笔记本读权限 |
| `remove` | `POST /api/notebook/removeNotebook` | `src/api/notebook.ts` | 需要确认，且需要删除权限（`rwd`） |
| `rename` | `POST /api/notebook/renameNotebook` | `src/api/notebook.ts` | 需要写权限（`rw` / `rwd`） |
| `get_conf` | `POST /api/notebook/getNotebookConf` | `src/api/notebook.ts` | 需要读权限 |
| `set_conf` | `POST /api/notebook/setNotebookConf` | `src/api/notebook.ts` | 需要写权限（`rw` / `rwd`） |
| `set_icon` | `POST /api/notebook/setNotebookIcon` | `src/api/notebook.ts` | 需要写权限（`rw` / `rwd`） |
| `get_permissions` | 插件本地逻辑 | `src/mcp/tools/notebook.ts` | 读取插件维护的权限状态 |
| `set_permission` | 插件本地逻辑 | `src/mcp/tools/notebook.ts` | 写入插件维护的权限状态 |
| `get_child_docs` | `POST /api/filetree/listDocsByPath` | `src/api/document.ts` | 固定读取笔记本根目录 `/`，并先校验笔记本存在性以返回更明确错误 |

## `document`

| MCP action | 思源 HTTP API | Wrapper | 说明 |
|---|---|---|---|
| `create` | `POST /api/filetree/createDocWithMd` | `src/api/document.ts` | 使用人类可读路径 |
| `rename` | `POST /api/filetree/renameDoc` / `POST /api/filetree/renameDocByID` | `src/api/document.ts` | 支持路径模式和 ID 模式 |
| `remove` | `POST /api/filetree/removeDoc` / `POST /api/filetree/removeDocByID` | `src/api/document.ts` | 需要确认 |
| `move` | `POST /api/filetree/moveDocs` / `POST /api/filetree/moveDocsByID` | `src/api/document.ts` | 需要确认 |
| `get_path` | `POST /api/filetree/getPathByID` | `src/api/document.ts` | 返回存储路径 |
| `get_hpath` | `POST /api/filetree/getHPathByID` / `POST /api/filetree/getHPathByPath` | `src/api/document.ts` | 返回人类可读路径 |
| `get_ids` | `POST /api/filetree/getIDsByHPath` | `src/api/document.ts` | 人类可读路径转文档 ID |
| `get_child_blocks` | `POST /api/block/getChildBlocks` | `src/api/block.ts` | 使用解析后的根文档 ID |
| `get_child_docs` | `POST /api/filetree/listDocsByPath` | `src/api/document.ts` | 使用解析后的笔记本 + 存储路径 |
| `set_icon` | `POST /api/attr/setBlockAttrs` | `src/api/attribute.ts` | 给文档块写入 `icon` 属性 |
| `list_tree` | `POST /api/filetree/listDocTree` | `src/api/document.ts` | 获取嵌套文档树 |
| `search_docs` | `POST /api/filetree/searchDocs` | `src/api/document.ts` | 思源原生是全局标题搜索 |
| `get_doc` | `POST /api/filetree/getDoc` | `src/api/document.ts` | 获取文档内容和元数据 |
| `create_daily_note` | `POST /api/filetree/createDailyNote` | `src/api/document.ts` | 创建或返回今日日记 |

### 路径语义

- 人类可读路径示例：
  - `/Inbox/Weekly Note`
- 存储路径示例：
  - `/20240318112233-abc123.sy`

### 使用人类可读路径的 action

- `document(action="create")`
- `document(action="get_ids")`

### 使用存储路径的 action

- `document(action="rename", notebook + path)`
- `document(action="remove", notebook + path)`
- `document(action="move", fromPaths + toNotebook + toPath)`
- `document(action="get_hpath", notebook + path)`
- `document(action="list_tree", notebook + path)`

## `block`

| MCP action | 思源 HTTP API | Wrapper | 说明 |
|---|---|---|---|
| `insert` | `POST /api/block/insertBlock` | `src/api/block.ts` | 按位置插入；MCP 层返回精简块结果 |
| `prepend` | `POST /api/block/prependBlock` | `src/api/block.ts` | 在父块/文档头部插入；MCP 层返回精简块结果 |
| `append` | `POST /api/block/appendBlock` | `src/api/block.ts` | 在父块/文档尾部插入；MCP 层返回精简块结果 |
| `update` | `POST /api/block/updateBlock` | `src/api/block.ts` | 更新块内容 |
| `delete` | `POST /api/block/deleteBlock` | `src/api/block.ts` | 需要确认 |
| `move` | `POST /api/block/moveBlock` | `src/api/block.ts` | 需要确认 |
| `fold` | `POST /api/block/foldBlock` | `src/api/block.ts` | 仅适用于可折叠块 |
| `unfold` | `POST /api/block/unfoldBlock` | `src/api/block.ts` | 仅适用于可折叠块 |
| `get_kramdown` | `POST /api/block/getBlockKramdown` | `src/api/block.ts` | 只读 |
| `get_children` | `POST /api/block/getChildBlocks` | `src/api/block.ts` | 只读 |
| `transfer_ref` | `POST /api/block/transferBlockRef` | `src/api/block.ts` | 写操作 |
| `set_attrs` | `POST /api/attr/setBlockAttrs` | `src/api/attribute.ts` | 设置块属性 |
| `get_attrs` | `POST /api/attr/getBlockAttrs` | `src/api/attribute.ts` | 读取块属性 |
| `exists` | `POST /api/block/checkBlockExist` | `src/api/block.ts` | 判断块是否存在 |
| `info` | `POST /api/block/getBlockInfo` | `src/api/block.ts` | 获取块所在根文档信息 |
| `breadcrumb` | `POST /api/block/getBlockBreadcrumb` | `src/api/block.ts` | 获取面包屑路径 |
| `dom` | `POST /api/block/getBlockDOM` | `src/api/block.ts` | 获取渲染后的 DOM |
| `recent_updated` | `POST /api/block/getRecentUpdatedBlocks` | `src/api/block.ts` | 工作区级最近更新 |
| `word_count` | `POST /api/block/getBlocksWordCount` | `src/api/block.ts` | 返回字数统计结构 |

## `file`

| MCP action | 思源 HTTP API | Wrapper | 说明 |
|---|---|---|---|
| `upload_asset` | `POST /api/asset/upload` | `src/api/file.ts` | multipart 上传 |
| `render_template` | `POST /api/template/render` | `src/api/file.ts` | 需要可读文档 ID |
| `render_sprig` | `POST /api/template/renderSprig` | `src/api/file.ts` | 仅模板渲染 |
| `export_md` | `POST /api/export/exportMdContent` | `src/api/file.ts` | 需要可读文档 ID |
| `export_resources` | `POST /api/export/exportResources` | `src/api/file.ts` | 将 `assets/...` 规范化为 `data/assets/...` 后导出；若传 `outputPath`，再把 ZIP 复制到本地文件系统（高危，需先确认） |
| `push_msg` | `POST /api/notification/pushMsg` | `src/api/file.ts` / `src/mcp/tools/system.ts` | 普通通知 |
| `push_err_msg` | `POST /api/notification/pushErrMsg` | `src/api/file.ts` / `src/mcp/tools/system.ts` | 错误通知 |
| `get_version` | `POST /api/system/version` | `src/api/file.ts` / `src/mcp/tools/system.ts` | 只读 |
| `get_current_time` | `POST /api/system/currentTime` | `src/api/file.ts` / `src/mcp/tools/system.ts` | 只读 |

## `search`

| MCP action | 思源 HTTP API | Wrapper | 说明 |
|---|---|---|---|
| `fulltext` | `POST /api/search/fullTextSearchBlock` | `src/api/search.ts` | 全文块搜索 |
| `query_sql` | `POST /api/query/sql` | `src/api/search.ts` | MCP 侧限制为 `SELECT` / `WITH` |
| `search_tag` | `POST /api/search/searchTag` | `src/api/search.ts` | 标签关键词搜索 |
| `get_backlinks` | `POST /api/ref/getBacklinkDoc` | `src/api/search.ts` | 只读 |
| `get_backmentions` | `POST /api/ref/getBackmentionDoc` | `src/api/search.ts` | 只读 |

## `tag`

| MCP action | 思源 HTTP API | Wrapper | 说明 |
|---|---|---|---|
| `list` | `POST /api/tag/getTag` | `src/api/tag.ts` | 工作区范围标签列表 |
| `rename` | `POST /api/tag/renameTag` | `src/api/tag.ts` | 全局重命名标签 |
| `remove` | `POST /api/tag/removeTag` | `src/api/tag.ts` | 需要确认 |

## `system`

| MCP action | 思源 HTTP API | Wrapper | 说明 |
|---|---|---|---|
| `workspace_info` | `POST /api/system/getWorkspaceInfo` | `src/api/system.ts` | 只读 |
| `network` | `POST /api/system/getNetwork` | `src/api/system.ts` | 返回脱敏代理信息 |
| `changelog` | `POST /api/system/getChangelog` | `src/api/system.ts` | 返回 `show` 与 `html` |
| `conf` | `POST /api/system/getConf` | `src/api/system.ts` | 返回脱敏配置 |
| `sys_fonts` | `POST /api/system/getSysFonts` | `src/api/system.ts` | 只读 |
| `boot_progress` | `POST /api/system/bootProgress` | `src/api/system.ts` | 只读 |

## MCP 参数形态

### 通用规则

- 每个 tool 都必须带 `action`
- 当前设计是“聚合 tool + action 分发”，不是“一条 HTTP API 对应一个 MCP tool”
- 参数校验定义在 `src/mcp/types.ts`

### 重要形态示例

#### `document(action="rename")`

- ID 模式：
  - `id`
  - `title`
- 路径模式：
  - `notebook`
  - `path`
  - `title`

#### `document(action="move")`

- ID 模式：
  - `fromIDs`
  - `toID`
- 路径模式：
  - `fromPaths`
  - `toNotebook`
  - `toPath`

说明：

- `fromPaths` / `toPath` 都是存储路径
- `toPath` 必须指向一个已存在的目标文档
- 不支持把 `toPath` 写成不存在的 `.sy` 路径或纯目录路径

#### `block(action="move")`

- 必填：
  - `id`
- 目标位置：
  - `previousID`，或
  - `parentID`，或
  - 两者同时提供

返回：

- MCP 成功时返回结构化对象，不再透传底层思源 API 的 `null`

## 覆盖范围说明

- 本文档记录的是“当前已经接入 MCP 的思源 API”
- 并未枚举思源 `kernel/api/` 下全部接口
- 未接入接口可参考上游源码：
  - `https://github.com/siyuan-note/siyuan/tree/master/kernel/api`
