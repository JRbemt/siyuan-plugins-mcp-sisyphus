# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

> 推荐搭配：[AI CLI Bridge for SiYuan](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge)。如果你想把 OpenCode、kimi Code 等有 Web 端的工具直接嵌进思源侧边栏使用，这两个插件一起用会更顺手。

这是一款为思源笔记打造的 MCP 服务器插件，以「渐进式披露」为设计哲学，将常用能力收敛为 `notebook`、`document`、`block`、`file`、`search`、`tag`、`system`、`mascot` 八个聚合工具。配合 `none / r / rw / rwd` 四态权限模型、高危操作二次确认机制、持续打磨的 tool 行为一致性，以及轻量的猫猫交互反馈，它在简化 AI 调用路径的同时，也让自动化链路更稳定、权限管理更细腻。

- `notebook`
- `document`
- `block`
- `file`
- `search`
- `tag`
- `system`
- `mascot`

每个 tool 通过必填的 `action` 字段分派具体操作，不再直接暴露大量 endpoint 风格的 tool 名。

## 设计思想：渐进式披露

MCP 工具层以**渐进式披露**为核心设计原则——只在需要时暴露复杂性，避免在初次交互时就把所有信息堆给 AI。

### 三个层次

**① Tool Description 层（LLM 最先看到的）**

每个工具的描述只详述高频的 **common actions** 及其必填字段，低频或高风险的 **advanced actions** 仅列出名称，并附指向按需文档的链接：

```
Common actions: list, create, rename, get_doc ...  （展示必填字段）
Additional actions: remove, move, list_tree ...    → 读取 siyuan://help/action/{tool}/{action}
```

这样 LLM 在调用 `listTools()` 时得到的是精炼信息，而不是所有 action 的大杂烩。

**② Help 层（按需获取）**

- 每个 action 的详细说明、参数语义、注意事项存放在 `siyuan://help/action/{tool}/{action}` resource 中，只有需要时才读取
- 调用任意工具时传入 `action: "help"` 可以内联获取该工具的完整分层帮助（为不支持 resource 的客户端提供兜底）

**③ Response 层（大数据自动收敛）**

大结果集不再一次性全量返回，而是附上摘要与 drill-down 指引：

| 场景 | 行为 |
|------|------|
| `search.fulltext` 结果 > 20 条 | 截断并提示 `page`/`pageSize` 分页参数 |
| `search.query_sql` 结果 > 50 行 | 截断并提示添加 `LIMIT`/`OFFSET` |
| `block.get_children` 子块 > 50 | 截断并提示用 `query_sql` 过滤 |
| `document.list_tree` 深层节点 | 默认折叠到 depth=3，通过 `maxDepth` 参数按需展开 |
| `document.get_doc` 内容 > 8000 字符 | 截断并提示用 `get_child_blocks` 逐块读取 |

**设计目标：** 降低首次调用的认知负荷；保留完整能力（所有 advanced actions 仍然可用）；对现有配置和工具名保持向后兼容。

## 功能特性

- 完整覆盖笔记本、文档、块、资源、导出和通知相关的思源 API
- 对外工具面收敛为 8 个聚合 tool，减少模型选错 tool 的概率
- 持续优化参数语义、返回结构与帮助提示，降低 MCP 客户端接入成本
- 插件设置仍保留到 action 级别的开关。默认 fallback 配置里，删除类 action 不暴露，移动类 action 仍暴露但必须先确认。
- 支持按笔记本 / 文档查询直属子文档与直属子块
- 支持全文搜索、SQL 查询、标签搜索、反向链接与反向提及查询
- 新增 `mascot` 工具与界面猫猫反馈，可查看余额、浏览商店、购买道具并直观看到 MCP 动作反馈
- 权限校验会先解析块 / 文档所属笔记本，再决定是否允许读写，边界行为更可预期

## 权限模型

- `rwd`：允许读、写、删除
- `rw`：允许读写，不允许删除
- `r`：只允许读，所有写和删除操作都应被拒绝
- `none`：禁止所有读、写、删除
- `notebook(action="set_permission")` 设置后，会立即影响后续的 `notebook`、`document`、`block` 调用
- AI 做回归时，建议一开始先把 8 个 tool 都预热调用一次，避免中途首次弹授权卡住流程

## 版本时间线

- `v0.1.12`：新增 `mascot` 聚合 tool，补强 Docker / 环境变量鉴权接入流程，并同步刷新第 8 个工具面的文档与测试
- `v0.1.11`：新增文档头图设置/清空能力，将资源上传改为本地路径流程并补充大文件确认约束，同时同步更新文档与测试
- `v0.1.10`：优化 MCP 聚合 tool 的行为一致性，补强权限/路径/帮助细节，并同步更新文档与测试
- `v0.1.9`：升级笔记本权限模型为 `none` / `r` / `rw` / `rwd`，增强 move/export 行为，并补齐 MCP 文档与测试覆盖
- `v0.1.8`：新增笔记本与文档图标支持，并将对外 MCP 聚合工具面恢复为 7 个 tool
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
- `file(action="upload_asset")`
- `tag(action="remove")`

如果你的 MCP 客户端会展示 instructions，模型应先征得确认再执行。这属于 instruction 层的安全约束，不代表服务端一定会弹出确认对话框。

默认 fallback 配置里，`document(action="move")` 和 `block(action="move")` 依然会出现在工具列表里。它们被启用并不代表可以跳过确认。

另外注意：
- 当 `file(action="upload_asset")` 的目标文件大于配置阈值（默认 `10 MB`）时，AI 必须终止当前操作并先询问用户；只有获得明确同意后，才能携带 `confirmLargeFile=true` 重试。

- `document(action="move", fromPaths + toNotebook + toPath)` 的 `toPath` 必须是一个已存在目标文档的存储路径。
- `block(action="move")` 在 MCP 层会返回结构化成功结果，即使底层思源 API 可能返回 `null`。

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
      "args": ["{SIYUAN_PATH}/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs"]
      "env":{
        "SIYUAN_API_URL": "http://127.0.0.1:6806/",
        "SIYUAN_TOKEN": "xxxxxx"
      }
    }
  }
}
```
到设置/关于中获取 API token

路径中的文件夹名必须与 `plugin.json` 的 `name` 一致，即 `siyuan-plugins-mcp-sisyphus`。

OpenClaw / mcporter 用户可参考 [SKILL.md](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/skills/siyuan-mcp-sisyphus/SKILL.md)。

详细 API ↔ MCP 映射文档见：[API_MCP_MAPPING.md](./API_MCP_MAPPING.md)

## Tool 模型

### `notebook`

| Action | 说明 |
|--------|------|
| `list` | 列出所有笔记本 |
| `create` | 创建笔记本（支持传入 `icon`，推荐使用 `1f4d4` 这类 Unicode 十六进制字符串） |
| `open` / `close` | 打开或关闭笔记本 |
| `rename` | 重命名笔记本 |
| `get_conf` / `set_conf` | 获取或设置笔记本配置 |
| `set_icon` | 设置笔记本图标；推荐使用 `1f4d4` 这类 Unicode 十六进制字符串，而不是直接传 emoji 字符 |
| `get_permissions` | 查看所有笔记本的 MCP 权限 |
| `set_permission` | 修改笔记本权限（`none` / `r` / `rw` / `rwd`） |
| `get_child_docs` | 获取笔记本根目录下的直属子文档，并返回更明确的笔记本状态错误 |

### `document`

| Action | 说明 |
|--------|------|
| `create` | 创建文档，支持 Markdown 内容（支持传入 `icon`，推荐使用 `1f4d4` 这类 Unicode 十六进制字符串） |
| `rename` | 重命名文档（按 ID 或存储路径） |
| `remove` | 删除文档（按 ID 或存储路径） |
| `move` | 移动文档（按 ID 或存储路径） |
| `set_icon` | 设置文档/文件夹图标；推荐使用 `1f4d4` 这类 Unicode 十六进制字符串，而不是直接传 emoji 字符 |
| `set_cover` | 设置文档头图，优先使用 `http(s)` URL，其次才是 `/assets/...` 路径 |
| `clear_cover` | 清空文档头图 |
| `get_path` | 按文档 ID 获取存储路径 |
| `get_hpath` | 按 ID 或存储路径获取人类可读路径 |
| `get_ids` | 按人类可读路径获取文档 ID |
| `get_child_blocks` | 获取文档的直属子块 |
| `get_child_docs` | 获取文档的直属子文档 |
| `list_tree` | 列出指定笔记本路径下的文档树 |
| `search_docs` | 按标题关键词搜索文档，并可再按存储路径缩小范围 |
| `get_doc` | 按 ID 获取文档内容与元数据（`markdown` 返回干净 Markdown，`html` 返回焦点视图 HTML 载荷） |
| `create_daily_note` | 为笔记本创建或返回今日日记 |

路径语义：`create` 与 `get_ids` 使用人类可读路径（如 `/Inbox/Weekly Note`）。`rename`、`remove`、`move`、`get_hpath`、`list_tree` 与 `search_docs.path` 使用 `get_path` 返回的存储路径。需要把人类可读路径解析成文档 ID 时，优先使用 `get_ids`。刚创建文档后，`get_ids` 可能因 SiYuan 索引延迟而短暂滞后。

头图语义：`set_cover` 与 `clear_cover` 是对文档根块 `title-img` 属性的语义封装。调用时优先直接传图片 URL；只有在用户明确希望把图片归档到思源资源库时，才先上传到 `/assets/...` 再设置头图。若要查看底层原值，可使用 `block(action="get_attrs", id=docId)`。

### `block`

| Action | 说明 |
|--------|------|
| `insert` / `prepend` / `append` | 插入块到指定位置/开头/末尾，并返回精简成功结果 |
| `update` | 更新块内容，并返回精简成功结果 |
| `delete` | 删除块 |
| `move` | 移动块到新位置 |
| `fold` / `unfold` | 折叠/展开可折叠块 |
| `get_kramdown` | 获取块的 kramdown 格式内容 |
| `get_children` | 获取直属子块 |
| `transfer_ref` | 转移块引用 |
| `set_attrs` / `get_attrs` | 设置或获取块属性，包括 `custom-riff-decks` 这类闪卡自定义属性 |
| `exists` | 检查块是否存在 |
| `info` | 获取块所在根文档元数据 |
| `breadcrumb` | 获取块的面包屑路径 |
| `dom` | 获取块的渲染 DOM |
| `recent_updated` | 列出最近更新的块，并按笔记本权限过滤且支持 `count` 截断 |
| `word_count` | 获取块的字数统计 |

### `file`

| Action | 说明 |
|--------|------|
| `upload_asset` | 读取本地文件路径并上传资源文件（因会读取本地文件系统，需先确认；超过配置阈值，默认 `10 MB`，时必须先中止并征求用户同意，再携带 `confirmLargeFile=true` 重试） |
| `render_template` | 使用文档上下文渲染模板 |
| `render_sprig` | 渲染 Sprig 模板 |
| `export_md` | 导出文档为 Markdown |
| `export_resources` | 导出资源为 ZIP 压缩包，兼容 `assets/...` 自动规范化到 `data/assets/...`，并可额外写到本地 `outputPath`（写本地时需用户确认） |

### `system`

| Action | 说明 |
|--------|------|
| `push_msg` / `push_err_msg` | 推送普通/错误通知消息 |
| `get_version` / `get_current_time` | 获取思源版本号或当前时间（`get_current_time` 还会返回 ISO 时间文本） |
| `workspace_info` | 获取思源工作区元数据。高风险：会暴露工作区绝对路径，默认关闭 |
| `network` | 获取脱敏后的网络代理信息 |
| `changelog` | 获取当前版本更新日志 |
| `conf` | 以“先摘要、后深入”的方式获取脱敏后的系统配置 |
| `sys_fonts` | 以“先摘要、后分页”的方式列出系统字体 |
| `boot_progress` | 获取当前启动进度详情 |

### `mascot`

| Action | 说明 |
|--------|------|
| `get_balance` | 获取猫猫当前可用余额 |
| `shop` | 列出猫猫商店中的商品，包含稳定 `item_id`、名称、价格、类型和 emoji |
| `buy` | 根据 `item_id` 购买一件猫猫商店商品，并从当前余额中扣费 |

标签不是通过单独的创建 action 生成的。请在块的 Markdown 内容里写成 `#标签#`，这样思源才能识别为真正的标签。

闪卡也不是通过单独的 action 标记的。请对题面块调用 `block(action="set_attrs", id=..., attrs={"custom-riff-decks":"<deck-id>"})` 写入块属性。推荐结构是：用 `h2` 标题作为题面，后续紧邻的块作为答案。

### `search`

| Action | 说明 |
|--------|------|
| `fulltext` | 全文搜索，可选 `stripHtml=true` 以额外返回纯文本字段 |
| `query_sql` | 执行只读 SQL（仅允许 SELECT / WITH），返回经过权限过滤的 `rows` 及元数据 |
| `search_tag` | 按关键词搜索标签 |
| `get_backlinks` | 查找引用了指定块的文档/块，若被裁剪会返回部分结果元数据 |
| `get_backmentions` | 查找提及了指定块名称的文档/块，若被裁剪会返回部分结果元数据 |

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
