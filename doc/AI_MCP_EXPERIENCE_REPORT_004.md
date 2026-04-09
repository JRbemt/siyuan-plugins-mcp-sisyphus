# SiYuan MCP Sisyphus 用户试用体验报告

> 测试时间：2026-04-07  
> 测试者身份：AI Agent（以真实用户视角）  
> SiYuan 版本：3.6.2  
> 插件版本：0.1.16

---

## 1. 整体感受

作为 AI Agent，我通过 MCP 工具与思源笔记进行了深度交互。整体体验**非常流畅**，功能覆盖全面且设计用心。特别是以下几个亮点让我印象深刻：

1. **统一的聚合工具设计** - 8 个核心工具覆盖了 90% 以上的使用场景
2. **实时 UI 刷新** - 每次操作后自动触发界面刷新，用户体验一致
3. **Mascot 互动机制** - 每次调用赚取金币的反馈循环增加了趣味性
4. **完善的帮助系统** - action="help" 提供详细的字段说明和示例

---

## 2. 各模块详细体验

### 2.1 Notebook 管理

`notebook(action="list")` 返回的信息结构清晰，包含了权限状态（`closed`）、图标、闪卡数量等元数据，对 AI 理解笔记本上下文很有帮助。

**优点**：
- 权限状态一目了然
- 返回的 `sortMode` 等字段有助于理解用户的组织习惯

**建议**：
- 可以考虑添加笔记本的总文档数统计，方便 AI 了解笔记本规模

### 2.2 文档操作

#### 文档创建 (`document(action="create")`)

创建文档的体验非常顺畅：

```json
{
  "success": true,
  "notebook": "20260404015658-tdkpobw",
  "path": "/MCP测试/用户试用报告文档",
  "id": "20260407233933-aeqvhgk",
  "iconHint": "...",
  "uiRefresh": { "applied": true, "operations": [...] }
}
```

**亮点**：
- 自动返回 `iconHint` 提示可以设置图标
- `uiRefresh` 让界面实时同步，无需手动刷新
- 支持直接在创建时传入 markdown 内容

#### 获取文档 (`document(action="get_doc")`)

`mode="markdown"` 返回的是干净的 Markdown 内容，包含 YAML Frontmatter（title, date, lastmod），这对 AI 处理非常友好。

**示例输出**：
```markdown
---
title: 用户试用报告文档
date: 2026-04-07T23:39:33+08:00
lastmod: 2026-04-07T23:39:41+08:00
---

# 用户试用报告文档
...
```

**优点**：
- 返回的是标准 Markdown，而非 HTML DOM
- 包含完整的时间戳元数据
- 支持分页读取（page/pageSize）

#### 设置图标 (`document(action="set_icon")`)

支持 Unicode hex code（如 `"1f4dd"`）设置图标，比直接传 emoji 更可靠。

**实时反馈**：
```json
{
  "success": true,
  "id": "20260407233933-aeqvhgk",
  "icon": "1f4dd",
  "uiRefresh": { "applied": true, "operations": [{"type": "reloadProtyle", "id": "..."}] }
}
```

#### 每日笔记 (`document(action="create_daily_note")`)

自动按日期路径创建文档，返回 `hPath` 便于后续引用。

### 2.3 块操作

#### 子块获取 (`document(action="get_child_blocks")`)

返回的块信息结构清晰：

```json
{
  "id": "20260407233933-1a1hi2x",
  "type": "h",
  "subType": "h1",
  "content": "MCP 用户试用报告",
  "markdown": "# MCP 用户试用报告"
}
```

**优点**：
- 同时提供 `content`（纯文本）和 `markdown`（原始格式）
- 类型区分清晰（heading/paragraph/list 等）

#### 块追加 (`block(action="append")`)

支持 Markdown 格式输入，自动解析为思源块。

**亮点**：
- 返回包含新创建块的 ID
- 自动触发 UI 刷新

#### 块更新 (`block(action="update")`)

更新后返回简洁的结果：

```json
{
  "success": true,
  "id": "20260407233941-zzko6p5",
  "dataType": "markdown",
  "markdown": "这是更新后的内容...",
  "uiRefresh": { "applied": true, ... }
}
```

**优点**：
- 返回更新后的 markdown 内容，便于确认
- 简洁的 JSON 结构，没有底层 DOM 操作噪音

#### Kramdown 获取 (`block(action="get_kramdown")`)

返回带 IAL 属性的 Kramdown 格式：

```markdown
#测试标签# #MCP体验#
{: id="20260407233933-px53fts" updated="20260407233933"}
```

这对需要精确控制块属性的场景很有用。

### 2.4 搜索功能

#### 全文搜索 (`search(action="fulltext")`)

搜索结果包含高亮标记 `<mark>关键词</mark>`，便于快速定位。

**亮点**：
- 返回 `matchedBlockCount` 和 `matchedRootCount` 统计
- 支持 `stripHtml` 参数获取纯文本
- 包含块的完整上下文（hPath、ial 等）

**搜索结果示例**：
```json
{
  "box": "20260404015658-tdkpobw",
  "path": "/20260407233933-7bkcwcg/20260407233933-aeqvhgk.sy",
  "hPath": "/MCP测试/用户试用报告文档",
  "content": "#测试标签# #<mark>MCP体验</mark>#",
  "markdown": "#测试标签# #MCP体验#",
  "ial": { "id": "...", "updated": "..." }
}
```

#### SQL 查询 (`search(action="query_sql")`)

非常强大的功能！可以直接查询 blocks 表：

```sql
SELECT id, content, type, created, updated FROM blocks WHERE content LIKE '%MCP%' LIMIT 5
```

**优点**：
- 只读限制确保安全
- 返回行数和权限过滤信息
- 自动截断大量结果并提供提示

**注意点**：
- `created`/`updated` 返回的是 `20260219162616` 格式（思源内部时间戳），非 ISO 8601

#### 反向链接 (`search(action="get_backlinks")`)

测试中对新创建的文档返回了 fallback 结果：

```json
{
  "backlinks": [],
  "backmentions": [],
  "fallbackUsed": true,
  "sourcePayloadMissing": true,
  "fallbackQuery": "sql",
  "resultConfidence": "fallback",
  "warning": "SiYuan returned no backlink payload; SQL fallback results are shown."
}
```

**设计亮点**：
- 当思源 API 返回空时，自动使用 SQL fallback
- 明确标记 `resultConfidence: fallback`，让用户知道结果可信度

### 2.5 标签管理

`tag(action="list")` 返回完整的标签树：

```json
{
  "name": "内容块",
  "label": "内容块",
  "children": [
    { "name": "嵌入", "label": "内容块/嵌入", "count": 1 },
    { "name": "引用", "label": "内容块/引用", "count": 1 }
  ],
  "count": 1
}
```

**优点**：
- 支持层级标签（如 `内容块/嵌入`）
- `count` 字段显示使用次数
- 结构清晰，便于构建标签云

### 2.6 文件导出

`file(action="export_md")` 返回完整的 Markdown：

```json
{
  "content": "...",
  "hPath": "/MCP测试/用户试用报告文档"
}
```

这对批量导出和备份场景很有用。

### 2.7 Mascot 互动

这是一个非常有趣的设计！每次成功调用 MCP 工具都会赚取 1 个金币：

```json
// 获取余额
{
  "action": "get_balance",
  "balance": 2323,
  "totalEarned": 2504
}

// 购买物品
{
  "success": true,
  "item": "小鱼干",
  "cost": 4,
  "balance": 2333
}
```

**设计亮点**：
- 将工具使用游戏化，增加用户粘性
- 商店物品丰富（猫粮、牛奶、小鱼干等）
- 购买后有 emoji 反馈（🐟）

---

## 3. 发现的优点

### 3.1 一致的响应结构

所有操作都遵循类似的返回格式：
- 成功：`{ success: true, ... }` 或 `{ action: "...", ... }`
- 失败：`{ error: { type: "...", message: "..." } }`
- UI 刷新：`{ uiRefresh: { applied: true, operations: [...] } }`

这让 AI 解析结果非常容易。

### 3.2 权限控制完善

在只读笔记本上尝试写入时，返回清晰的错误：

```json
{
  "error": {
    "type": "permission_denied",
    "current_permission": "r",
    "required_permission": "write"
  }
}
```

### 3.3 帮助系统详尽

每个工具都支持 `action="help"`，返回：
- 所有 action 的列表
- 每个 action 的必填字段
- 使用提示和示例
- 相关帮助资源链接

### 3.4 UI 自动刷新

每次修改操作后自动触发：
- `reloadProtyle` - 刷新编辑器
- `reloadFiletree` - 刷新文件树

这让 AI 操作和用户界面保持同步。

---

## 4. 可改进之处

### 4.1 时间格式统一

**现状**：
- SQL 查询返回：`"created": "20260219162616"`
- export_md 返回：`"date": "2026-04-07T23:39:33+08:00"`

**建议**：统一使用 ISO 8601 格式，或提供时间戳转换工具。

### 4.2 反向链接实时性

新创建的文档可能暂时无法获取反向链接（返回 fallback）。如果能提供一个 `forceRefresh` 参数强制刷新索引会更好。

### 4.3 块操作返回 ID

某些块操作（如 update）可以返回更详细的块信息（如 updated 时间戳）。

### 4.4 批量操作支持

目前大多数操作是单条记录，如果能支持批量创建/更新块会更高效。

---

## 5. 使用建议

### 对 AI Agent 的建议

1. **优先使用 document(action="get_doc", mode="markdown")** 获取干净 Markdown
2. **善用 action="help"** 了解字段要求
3. **注意路径语义**：创建用 human-readable，其他操作用 storage path
4. **设置文档图标** 使用 Unicode hex code 而非 emoji
5. **利用 SQL 查询** 进行复杂的批量检索

### 对用户的建议

1. **配置笔记本权限** 充分利用 MCP 的权限控制
2. **尝试 Mascot 功能** 让 AI 使用更有趣
3. **使用 Daily Note** 快速创建日记
4. **设置自定义规则** 通过 userRulesText 定制 AI 行为

---

## 6. 总结

SiYuan MCP Sisyphus 是**目前思源生态中最完整、最友好的 AI 集成方案**。它不仅提供了全面的 API 覆盖，还在以下方面表现出色：

1. **API 设计** - 统一的聚合工具模式，学习成本低
2. **实时反馈** - UI 自动刷新，所见即所得
3. **权限控制** - 细粒度的笔记本级权限管理
4. **帮助系统** - 详尽的自文档化设计
5. **趣味性** - Mascot 互动增加了使用乐趣

**推荐度：⭐⭐⭐⭐⭐**

这个 MCP 让 AI 能够真正地成为思源笔记的智能助手，无论是内容创作、知识整理还是数据分析，都能胜任。
