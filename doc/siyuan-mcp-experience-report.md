# 思源 MCP (`siyuan-mcp-sisyphus`) 试用体验报告

> 测试时间：2026-04-03  
> SiYuan 版本：3.6.2  
> 测试方式：以真实用户视角，通过 MCP 工具调用覆盖文档管理、块操作、搜索、标签、导出等高频场景。

---

## 1. 整体印象

`siyuan-mcp-sisyphus` 封装了思源笔记的核心能力，功能覆盖全面，从 notebook 管理到 block 粒度的 CRUD、全文搜索、SQL 查询、标签管理、文件导出等都有涉及。基础操作的成功率较高，权限控制也到位。但在**返回值设计、一致性、实时性、路径语义**等方面存在明显的卡手体验，会给 AI Agent 和普通用户带来不少困惑。

---

## 2. 各模块详细体验

### 2.1 Notebook 管理

- `notebook(action="list")`：返回简洁，字段清晰，包含权限相关状态（`closed`）。
- `notebook(action="get_child_docs")`：可一次性拿到根目录文档列表，满足基本需求。
- **权限测试**：在只读 notebook 中尝试 `document(action="create")`，被正确拒绝：
  ```json
  {
    "error": {
      "type": "permission_denied",
      "current_permission": "r",
      "required_permission": "write"
    }
  }
  ```
  错误提示清晰，对 AI 很友好。

### 2.2 文档生命周期

- **创建**：`document(action="create", notebook=..., path=..., markdown=...)` 成功，返回 `id` 和 `path`。
- **重命名**：`document(action="rename", id=..., title=...)` 成功，简洁返回 `{success: true}`。
- **获取子块**：`document(action="get_child_blocks", id=...)` 返回块的精简信息（`id`, `type`, `subType`, `content`, `markdown`），很实用。
- **获取路径**：
  - `get_path` 返回 **storage path**：`/20260403035716-vpfsiy2/20260403035716-8zqqdzq.sy`
  - `get_hpath` 返回 **human-readable path**：`/MCP测试/MCP文档创建测试（已重命名）`
- **移动**：`document(action="move", fromIDs=[...], toID=...)` 成功，且移动后 `get_child_docs` 能正确显示子文档关系。
- **删除**：`document(action="remove", id=...)` 成功。
- **获取文档内容**：`document(action="get_doc", id=..., mode="markdown")` 返回的却是大量 HTML DOM 结构（`<div data-type="NodeHeading" ...>`），`mode` 参数的效果不明显，几乎不可用作用户预期的纯 markdown 读取。

### 2.3 块操作

- **append / prepend**：`block(action="append"|"prepend", parentID=..., data=..., dataType="markdown")` 成功。
  - 当 `parentID` 为文档 ID 时，确实插入到文档末尾/开头。
  - 返回简洁：`{success: true, id: "...", parentID: "..."}`。
- **update**：`block(action="update", id=..., data=..., dataType="markdown")` **卡手**。
  - 虽然能成功更新内容，但返回的是一个极其冗长的底层 DOM 操作数组，包含大量 HTML 字符串和内部字段（`doOperations`, `undoOperations`, `data-node-id` 等）。AI 难以消费这种返回，用户也看不懂。
- **get_kramdown**：能拿到带思源 IAL 语法的 markdown，但发现 **标签前面出现了零宽字符**：
  ```markdown
  ​#标签测试#​ #MCP体验#
  {: updated="20260403035736" id="20260403035736-qpi5z9c"}
  ```
  这会导致外部 markdown 解析器无法正确识别标签。
- **fold / unfold**：成功且返回简洁。

### 2.4 标签管理

- **创建标签**：没有直接的 `tag(action="create")`，需要在 markdown 中写 `#标签名#`（前后都要 `#`）。这个设计符合思源原生逻辑，但 MCP 说明里写得很清楚，上手无障碍。
- `tag(action="list")`：标签列表返回正常，能看到刚创建的标签，且 `count` 字段统计使用次数，很棒。

### 2.5 搜索与查询

- **全文搜索 `search(action="fulltext")`**：
  - 搜索结果中的 `content` 字段包含高亮 HTML `<mark>关键词</mark>`，对需要纯文本处理的 AI 不友好，需要额外清洗。
  - 新创建的文档/块有时无法立即搜索到（可能是索引延迟），测试中刚 append 的段落用全文搜索找不到，等了数秒才出现。
- **SQL 查询 `search(action="query_sql")`**：
  - 非常强大，可直接查询 `blocks` 表。
  - 但注意：`created` / `updated` 字段返回的是类似 `20260403035716` 的字符串格式，不是标准 ISO 时间戳，和 `export_md` 中返回的 `2026-04-03T03:57:16+08:00` 不一致。
- **反向链接 `get_backlinks` / `get_backmentions`**：
  - **严重卡手**。测试中明确在文档中使用思源的块引用语法 `((20260403035716-8zqqdzq))`，SiYuan 内部也解析成了 `<span data-type="block-ref">`，但 `get_backlinks` 返回空数组 `{"backlinks": [], "backmentions": []}`。
  - 这会让用户误以为引用没有被记录，或者 API 有 bug。

### 2.6 文件与导出

- `file(action="export_md", id=...)`：返回完整的 markdown 字符串和 `hPath`，非常好用。
- `file(action="export_resources", paths=[...])`：返回临时 ZIP 路径 `temp/export/export-2026-04-03_03-57-58.zip`，满足批量导出需求。

### 2.7 错误处理与参数校验

- 缺少必填参数时，返回统一的 `validation_error`，结构清晰：
  ```json
  {
    "error": {
      "type": "validation_error",
      "fields": [
        { "path": "notebook", "message": "notebook is required." },
        { "path": "path", "message": "path is required." }
      ],
      "hint": "Use notebook + path + markdown, where path is human-readable."
    }
  }
  ```
  这是整个 MCP 中体验最好的部分之一。

---

## 3. 发现的卡点与问题

### 3.1 返回值不一致且噪音大
- **block update** 返回底层 DOM 操作对象，而不是简单的成功确认或更新后的 block 信息。
- **get_doc(mode="markdown")** 返回的是 HTML DOM 而非干净 markdown，与实际预期严重不符。
- **export_md** 的行为反而比 `get_doc` 更像“获取 markdown 内容”。

### 3.2 backlinks/get_backmentions 失效或延迟严重
- 明确的块引用语法 `((id))` 在内容中已被解析，但 `get_backlinks` 仍返回空数组。
- 这会让依赖引用关系做知识图谱梳理的 AI 工作流彻底不可用。

### 3.3 全文搜索实时性差
- 新写入的 block 内容无法通过全文搜索立即检索到。
- 搜索结果带 `<mark>` HTML，不便进行二次处理。

### 3.4 标签在 Kramdown / Export 中出现零宽字符
- `#标签测试#` 变成了 `​#标签测试#​`（零宽字符包裹），影响外部解析和下游处理。

### 3.5 路径语义双轨制容易混淆
- `document(create)` 的 `path` 是 **human-readable**（如 `/MCP测试/文档`）。
- `get_path` 返回的是 **storage path**（如 `/2026.../2026....sy`）。
- 其他依赖 `path` 的操作（如 move 的路径版）要求使用 storage path。
- 用户/AI 很容易把两种路径混用导致失败。

### 3.6 时间格式不统一
- SQL 查询里的 `created`/`updated` 是 `20260403035716`（无分隔符字符串）。
- `export_md` 的元数据里是标准 ISO 时间 `2026-04-03T03:57:16+08:00`。

### 3.7 安全确认机制实践与文档说明不一致
- MCP 说明中强调 `document(action="move")` 和 `document(action="remove")` 需要用户确认。
- 实际测试中这些操作直接成功，没有触发任何确认流程。这虽然提高了效率，但与文档承诺不一致，可能让用户对安全性产生误判。

### 3.8 缺少中间粒度查询
- 例如：没有方便的 API 直接通过文档路径或标题获取文档 ID，必须先 search 或 list tree，增加了操作步数。

---

## 4. 优化建议（按优先级）

### P0 - 核心功能修复
1. **修复 `get_backlinks` 的实时性问题**
   - 确保块引用语法写入后，backlinks 查询能正确返回引用关系。
   - 如果存在索引延迟，应在 API 层面做同步刷新，或至少在文档中明确说明延迟上限。

2. **统一 `get_doc` 的返回值格式**
   - `mode="markdown"` 应返回干净、可直接阅读的 markdown 字符串，而不是 HTML DOM。
   - 如果当前行为是为了保留思源内部格式，建议新增 `mode="clean_markdown"` 或纯文本模式。

3. **简化 `block update` 返回值**
   - 返回更新后的块摘要（`id`, `type`, `markdown`, `updated`）即可，不要暴露底层 `doOperations` DOM 结构。

### P1 - 体验与一致性提升
4. **去除标签导出时的零宽字符**
   - 在 `get_kramdown` 和 `export_md` 中清理标签周围的零宽字符，保证标准 markdown 兼容性。

5. **规范时间格式**
   - 建议 SQL 查询的 `blocks` 表中 `created`/`updated` 字段或返回的 JSON 中统一为标准 ISO 8601 时间戳，方便 AI 做时间计算和排序。

6. **优化全文搜索返回结构**
   - 提供可选参数（如 `stripHtml=true`）去除搜索结果中的 `<mark>` 高亮标签，或者将高亮结果单独放在字段里（`content` 纯文本 + `highlightedContent` HTML）。
   - 降低新内容索引延迟，或提供 `syncIndex` 参数强制刷新。

### P2 - API 设计与易用性
7. **路径语义统一或增强提示**
   - 在参数校验错误中明确提示当前传入的 path 类型不对（如 "Expected storage path, got human-readable path"）。
   - 或者让 `get_path` 的返回值字段名更明确，如 `storagePath` 而非 `path`。

8. **新增通过路径/标题查询文档的便捷接口**
   - 例如 `document(action="get_by_hpath", notebook=..., hpath=...)`，减少从标题到 ID 的转换步骤。

9. **文档与行为一致**
   - 如果 `remove`/`move` 等操作当前不需要确认，应更新 MCP 说明；如果需要确认，应确保确认机制在所有环境下都生效。

---

## 5. 总结

`siyuan-mcp-sisyphus` 是目前思源生态中连接 AI Agent 最直接、最完整的桥梁，**功能广度足够，但细节打磨仍有较大空间**。对于普通用户和 AI 来说，最大的三个期望是：

1. **backlink 引用关系要准、要实时**（知识管理的核心）。
2. **内容的读取和写入要符合 markdown 直觉**，不要返回底层 HTML DOM。
3. **操作反馈要干净统一**，减少 AI 解析噪音和人类理解成本。

如果能优先解决上述 P0/P1 问题，这个 MCP 的可用性会有质的飞跃。
