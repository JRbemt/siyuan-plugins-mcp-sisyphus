# SiYuan MCP Sisyphus - AI 使用体验报告

> 测试日期：2026-04-03
>
> SiYuan 版本：3.6.2
>
> 测试环境：macOS Darwin 25.3.0
>
> 测试人员：claude 
>
> 测试方式：AI (Claude Opus 4.6) 模拟真实用户场景，全量覆盖 7 个工具、59 个 action
>

---

## 一、测试覆盖总览

| 工具 | Actions 总数 | 已测试 | 覆盖率 | 整体评价 |
|------|-------------|--------|--------|---------|
| notebook | 12 | list, get_child_docs, get_conf, get_permissions | 33% | 基础功能完善 |
| document | 14 | create, get_doc, get_child_blocks, get_child_docs, get_path, get_hpath, get_ids, search_docs, list_tree, create_daily_note, set_icon | 79% | 核心功能好用，但有坑 |
| block | 19 | append, get_kramdown, get_children, exists, info, breadcrumb, dom, recent_updated, word_count, set_attrs, get_attrs | 58% | 读操作很棒，写操作返回值需改进 |
| file | 5 | export_md, render_sprig | 40% | 好用 |
| search | 5 | fulltext, query_sql, search_tag, get_backlinks, get_backmentions | 100% | 功能强大，但有权限和文档问题 |
| tag | 3 | list | 33% | 简洁够用 |
| system | 10 | get_version, get_current_time, boot_progress, conf, network, sys_fonts, changelog, push_msg | 80% | 渐进式设计优秀 |

---

## 二、亮点（做得好的地方）

### 1. 渐进式信息读取设计 (system conf/sys_fonts)
`system(action="conf")` 的 summary -> get + keyPath 的渐进式设计非常适合 AI 使用。避免了一次性返回巨大的配置对象，让 AI 按需探索。`sys_fonts` 的分页设计同理。

**示例体验**：先调 `conf(mode="summary")` 看到 32 个顶层配置项，然后按需 drill down，不浪费 token。

### 2. 权限系统的错误信息清晰
向只读笔记本写入时，返回的错误信息非常明确：
```json
{
  "type": "permission_denied",
  "message": "Notebook \"xxx\" has permission \"r\", write access is required.",
  "current_permission": "r",
  "required_permission": "write"
}
```
直接告诉了当前权限、需要什么权限、以及如何修改（`set_permission`），AI 可以据此做出合理的后续决策。

### 3. get_child_blocks 的格式非常 AI 友好
返回的结构清晰，包含 id、type、subType、content、markdown 四个关键字段，信息密度高而不冗余。比 `get_doc` 返回的 raw HTML DOM 好用太多了。

### 4. 文档创建的人类可读路径
`document(action="create")` 使用 `/MCP体验测试/AI自动创建的笔记` 这样的人类可读路径，非常直观。

### 5. Sprig 模板渲染
`file(action="render_sprig")` 完美工作，`{{ now | date "2006-01-02" }}` 正确返回当前日期，对自动化场景非常有用。

### 6. 写操作的精简返回值
block append/prepend/insert 返回精简的 `{success, id, parentID, previousID, dataType}`，而不是完整的块内容，节省 token。

---

## 三、问题与痛点（按严重程度排序）

### P0 - 严重问题

#### 1. `block(action="exists")` 对无效 ID 抛错而非返回 false
**测试**：`block(action="exists", id="invalid-block-id-12345")`
**期望**：`{ exists: false }`
**实际**：
```json
{
  "error": { "type": "api_error", "message": "SiYuan API error: -1 - 未找到 ID 为 [invalid-block-id-12345] 的内容块" }
}
```
**影响**：`exists` 的核心语义就是"检查是否存在"，对不存在的 ID 报错违反了最小惊讶原则。AI 无法区分"不存在"和"API 故障"。
**修复建议**：捕获 SiYuan 的 `-1` 错误码，当 action 为 `exists` 时返回 `{ exists: false }` 而非抛错。

#### 2. `search(action="fulltext")` 返回受限笔记本（permission="none"）的结果
**测试**：搜索"测试"，结果中包含来自 `20260402004006-y2vg36p`（none 权限）笔记本的内容。
**影响**：权限为 `none` 意味着"完全不可访问"，但全文搜索仍然泄露了这些笔记本的文档标题和内容。这是一个**数据泄露**问题。
**修复建议**：在 fulltext 返回结果前，按笔记本权限过滤，移除 `none` 权限笔记本的结果。

#### 3. `search(action="get_backlinks/get_backmentions")` 因目标块所在笔记本权限导致整体失败
**测试**：查询 `20260219123801-b2lg0yg` 的反链，该块在 `vilji5d`（rwd），但返回权限错误指向 `y2vg36p`（none）。
**推测原因**：反链的来源块可能在受限笔记本中，导致权限检查失败并阻断了整个查询。
**影响**：一个受限笔记本的反链存在就会导致整个反链查询失败，这不合理。
**修复建议**：对反链结果进行逐条权限过滤，而不是 fail-fast。过滤掉受限笔记本的反链条目，返回有权限的部分。

---

### P1 - 体验问题

#### 4. `document(action="list_tree")` 只返回 ID，没有名称
**测试结果**：
```json
{ "tree": [{ "id": "20250921114924-lgjxghk", "children": [{ "id": "20250923170501-c8nmjrc" }] }] }
```
**影响**：AI 拿到一堆 ID 完全无法理解文档结构，必须逐个调用 `get_hpath` 或 `get_doc` 来获取名称，产生 N+1 调用问题。
**修复建议**：在 tree 节点中至少包含 `name`（标题）和 `icon` 字段。

#### 5. `document(action="get_doc")` 返回的 HTML DOM 对 AI 不友好
**表现**：返回完整的 protyle DOM HTML，包含 `data-node-id`、`contenteditable`、`spellcheck` 等大量 UI 属性。一个简单文档返回了数 KB 的 HTML。
**对比**：`get_child_blocks` 返回的结构化数据简洁得多。
**修复建议**：
- 默认 `mode="markdown"` 返回 markdown 而非 HTML DOM
- 或者在文档说明中更明确地引导 AI 优先使用 `get_child_blocks`

#### 6. SQL 查询的 type 字段值与工具描述不一致
**工具描述**：使用 `NodeHeading`、`NodeParagraph` 等值描述 block type
**实际 SQL 表**：使用短代码 `h`、`p`、`d`、`l`、`i`、`b` 等
**测试**：`SELECT ... WHERE type = 'NodeHeading'` 返回空，实际应该用 `type = 'h'`
**影响**：AI 基于工具描述构造的 SQL 查询会返回空结果，需要试错才能发现。
**修复建议**：在 `search(action="query_sql")` 的描述中明确列出 blocks 表的 type 字段取值映射表。

#### 7. `get_child_docs` 的 name 字段包含 `.sy` 后缀
**测试结果**：`"name": "双链测试.sy"` 而非 `"双链测试"`
**影响**：`.sy` 是 SiYuan 内部存储格式，对用户/AI 无意义。
**修复建议**：在返回前 strip `.sy` 后缀。

#### 8. `document(action="get_ids")` 对刚创建的文档返回空
**测试**：创建文档 `/MCP体验测试/AI自动创建的笔记` 成功（返回了 ID），但随即调用 `get_ids(path="/MCP体验测试/AI自动创建的笔记")` 返回 `[]`。
**推测原因**：可能是 SiYuan 索引延迟，或路径格式不完全匹配（如自动在路径中插入了 ID）。
**影响**：AI 在创建文档后无法通过路径反查 ID，只能依赖创建时返回的 ID。
**修复建议**：
- 如果是索引延迟问题，在 MCP 层面增加说明
- 检查路径匹配逻辑是否存在 edge case

---

### P2 - 小问题 / 改进建议

#### 9. `block(action="word_count")` 返回的 blockCount 始终为 1
**测试**：对一个有 8 个子块的文档调用 word_count，`blockCount` 返回 1。
**疑问**：这里的 blockCount 似乎计算的是传入的 ID 数量而非文档内块数？如果是这样设计，应该在文档中说明。

#### 10. fulltext 搜索结果的 `stripHtml` 未添加 `plainContent` 字段
**测试**：`fulltext(query="MCP", stripHtml=true)` 返回的 blocks 中 content 仍含 `<mark>` 标签，未看到额外的 `plainContent` 字段。
**期望**：根据 normalize.ts 的实现，应该会添加 `plainContent` 去除 HTML 标签的纯文本。
**可能原因**：normalize 逻辑可能未被正确应用到结果上，或 `plainContent` 字段名不同。

#### 11. `document(action="create_daily_note")` 返回值缺少 path 信息
**测试结果**：`{ success: true, notebook: "...", id: "..." }`
**建议**：返回 `hPath` 字段（如 `/daily note/2026/04/2026-04-03`），让 AI 知道 daily note 被创建在哪里。

#### 12. `system(action="get_current_time")` 返回 epoch 毫秒
**测试结果**：`{ "currentTime": 1775161716946 }`
**建议**：同时返回 ISO 8601 格式的时间字符串，减少 AI 的转换负担。

#### 13. `breadcrumb` 首条目包含笔记本名称
**测试结果**：第一条面包屑 name 为 `权限测试 - 完全访问/MCP体验测试/AI自动创建的笔记`，这个格式将笔记本名称与路径混在一起。
**建议**：将笔记本名称拆分为独立字段，或者面包屑的第一级单独标记为笔记本。

#### 14. `search(action="search_docs")` 跨笔记本返回结果但声称 notebook 用于权限限定
**测试**：指定 notebook=`vilji5d` 搜索"工作"，但结果包含来自 `y2vg36p`（none 权限）笔记本的文档。
**影响**：与 P0-2 同类问题 —— none 权限笔记本的信息不应泄露。

---

## 四、用户场景模拟与体验总结

### 场景 1：「帮我在笔记里创建一个会议记录」
**流程**：notebook(list) -> document(create) -> block(append)
**体验**：流畅。创建文档的人类可读路径很直观，追加内容也很顺利。
**卡手点**：无

### 场景 2：「帮我找一下之前写的关于 MCP 的笔记」
**流程**：search(fulltext) -> document(get_child_blocks)
**体验**：搜索功能强大，但返回了不应该看到的受限笔记本内容（P0 问题）。

### 场景 3：「帮我看看这个文档的结构」
**流程**：document(list_tree)
**体验**：**非常差**。只返回 ID 树，AI 完全无法理解文档结构，必须逐个查询名称。这是最严重的体验瓶颈之一。

### 场景 4：「帮我给这个笔记加个标签」
**流程**：block(update, data="#标签# 原有内容")
**体验**：需要先 get_kramdown 获取原内容，再整合标签后 update。流程较繁琐。
**建议**：考虑提供 `block(action="add_tag")` 简化操作。

### 场景 5：「帮我用 SQL 查一下最近编辑的标题」
**流程**：search(query_sql)
**体验**：SQL 很强大，但 type 字段值与文档描述不一致（P1 问题），AI 第一次查询大概率失败。

### 场景 6：「帮我查看某个文档的反链」
**流程**：search(get_backlinks)
**体验**：**完全失败**。因为反链来源包含受限笔记本，整个查询报错（P0 问题）。

### 场景 7：「帮我导出这个文档为 Markdown」
**流程**：file(export_md)
**体验**：完美。返回格式规范的 Markdown，包含 frontmatter。

---

## 五、优化方案与修复计划

### 第一优先级（P0 修复）

#### Fix 1: block(exists) 对不存在 ID 返回 false
- **文件**: `src/mcp/tools/block.ts`
- **方案**: 在 `exists` action 的 handler 中，捕获 SiYuan API 的 `-1` 错误码，返回 `{ id, exists: false }` 而非抛错
- **工作量**: 小（~10 行）

#### Fix 2: 全文搜索权限过滤
- **文件**: `src/mcp/tools/search.ts`
- **方案**: 在 fulltext 和 search_docs 返回结果后，根据 PermissionManager 过滤掉 `none` 权限笔记本的结果
- **注意**: `r` (只读) 权限的笔记本搜索结果应保留
- **工作量**: 中（需要在搜索结果处理层面加入权限过滤）

#### Fix 3: 反链/提及查询的权限容错
- **文件**: `src/mcp/tools/search.ts`
- **方案**: 
  - 方案 A: 在查询结果中过滤受限笔记本的条目，返回有权限的部分
  - 方案 B: 如果目标块本身有权限，先执行查询，再过滤返回结果
- **工作量**: 中

### 第二优先级（P1 改进）

#### Fix 4: list_tree 返回名称和图标
- **文件**: `src/mcp/tools/document.ts`
- **方案**: 在 tree 构建时附加 `name` 和 `icon` 字段（从 SiYuan API 获取或缓存）
- **工作量**: 中（取决于 SiYuan API 是否一次性返回这些信息）

#### Fix 5: SQL type 字段文档补充
- **文件**: `src/mcp/help.ts`
- **方案**: 在 `query_sql` 的 action hint 中添加 type 字段映射表：
  ```
  d=document, h=heading, p=paragraph, l=list, i=list-item,
  b=blockquote, c=code, t=table, s=super-block, m=math,
  html=html, widget=widget, iframe=iframe, query_embed=query_embed,
  tb=thematic-break, video=video, audio=audio
  ```
- **工作量**: 小（纯文档）

#### Fix 6: get_child_docs 去除 .sy 后缀
- **文件**: `src/mcp/tools/document.ts` 或 `src/mcp/tools/context.ts`
- **方案**: 在 `listChildDocumentsByPath()` 中 strip `.sy` 后缀：`name.replace(/\.sy$/, '')`
- **工作量**: 极小（1 行）

#### Fix 7: get_ids 路径匹配检查
- **文件**: `src/mcp/tools/document.ts`
- **方案**: 调查路径匹配逻辑，确认是否存在 SiYuan 索引延迟问题；如果是已知限制，在文档中说明
- **工作量**: 小

### 第三优先级（P2 增强）

#### Fix 8: get_doc 默认返回 markdown 模式或文档引导
- **文件**: `src/mcp/help.ts`
- **方案**: 在 `get_doc` hint 中建议 AI 优先使用 `get_child_blocks` 获取结构化内容

#### Fix 9: create_daily_note 返回 hPath
- **文件**: `src/mcp/tools/document.ts`
- **方案**: 在返回值中加入 `hPath` 字段

#### Fix 10: get_current_time 返回 ISO 时间
- **文件**: `src/mcp/tools/system.ts`
- **方案**: 同时返回 `{ currentTime: epoch, iso: "2026-04-03T04:29:08+08:00" }`

#### Fix 11: fulltext stripHtml 验证
- **文件**: `src/mcp/normalize.ts`, `src/mcp/tools/search.ts`
- **方案**: 验证 normalizeFulltextBlocks 是否正确应用到返回结果

---

## 六、总结

### 整体评分：7.5/10

**优势**：
- 工具设计合理，action 分组让 AI 容易理解和选择
- 权限系统的错误信息非常清晰，AI 能据此自我修正
- 渐进式信息读取（conf/sys_fonts）设计优秀
- 精简的写操作返回值节省 token
- Sprig 模板和 Markdown 导出体验完美

**需改进**：
- 搜索系统的权限过滤是最关键的安全问题
- `exists` 对不存在 ID 抛错违反语义
- `list_tree` 只返回 ID 严重影响 AI 理解文档结构
- SQL type 字段文档与实际不一致导致 AI 查询频繁失败
- `.sy` 后缀泄漏到返回值中

**最佳实践建议（面向使用此 MCP 的 AI）**：
1. 读文档内容优先用 `get_child_blocks` 而非 `get_doc`
2. 写入带标签的内容时使用 `#标签#` 双井号语法
3. 创建文档后保存返回的 ID，不要依赖 `get_ids` 反查
4. SQL 查询中 type 字段使用短代码（h/p/d/l/i/b/c/t）
5. 先调 `notebook(list)` + `get_permissions` 了解权限再操作
