# SiYuan MCP Sisyphus - AI 使用体验报告（当前版本复盘）

> 测试日期：2026-04-03
>
> 评估对象：`siyuan-plugins-mcp-sisyphus`
>
> 测试人员：Codex
>
> 测试方式：参考 `doc/AI_MCP_EXPERIENCE_REPORT_001.md` 的结构，结合 `README_zh_CN.md`、`API_MCP_MAPPING.md`、当前 `src/mcp/` 实现与现有单测进行体验复盘
>
> 说明：本报告重点关注“当前实现仍存在的问题”和“建议的修改计划”，不重复已在近期版本中修复的问题

---

## 一、体验总览

| 模块 | 当前体验 | 结论 |
|------|----------|------|
| notebook | 权限模型清晰，聚合度高 | 设计成熟 |
| document | 路径语义已有说明，但个别 action 存在参数落空 | 核心可用，仍有一致性问题 |
| block | 写操作返回值已明显优化 | 读写体验较好，但全局读接口仍有权限缺口 |
| search | fulltext 体验已比早期版本好很多 | 仍存在高风险权限边界问题 |
| file | export / render 类能力清晰 | 稳定好用 |
| tag | 轻量直接 | 基本够用 |
| system | 渐进式披露设计优秀 | 适合 AI 使用 |

---

## 二、做得好的地方

### 1. 写操作返回值明显更适合 AI
`block(action="append" | "prepend" | "insert" | "update")` 现在都走精简返回，不再把底层 DOM 操作数组直接暴露给模型。对 Agent 来说，这一点非常关键。

### 2. `get_doc(mode="markdown")` 语义已经变正
当前 `document(action="get_doc")` 在 `mode="markdown"` 下已经改为走 Markdown 导出路径，返回 `content` 与 `hPath`，这比旧版直接返回 HTML DOM 友好很多。

### 3. fulltext 已支持 `stripHtml`
`search(action="fulltext", stripHtml=true)` 现在会额外返回 `plainContent`，保留高亮 HTML 的同时，也给 AI 一个更容易继续处理的纯文本字段。

### 4. 权限报错结构整体清晰
`permission_denied` 的返回形态清楚，能告诉 AI 当前权限与所需权限，适合自动化链路继续决策。

### 5. 路径双轨制至少已经被文档正面解释
虽然仍有学习成本，但 README / help 已明确区分 human-readable path 与 storage path，避免了完全黑盒。

---

## 三、问题与痛点（按优先级排序）

### P0 - 严重问题

#### 1. `search(action="query_sql")` 仍然没有权限过滤
**现状**：`src/mcp/tools/search.ts` 中 `query_sql` 直接调用 `searchApi.querySQL()` 并原样返回结果，没有经过 `PermissionManager` 过滤。

**影响**：
- 如果 MCP 客户端暴露了 `query_sql`，理论上可以通过 `blocks` / `spans` / `assets` 表读取 `none` 权限笔记本的数据；
- 这和其它工具已经建立起来的 notebook 权限模型不一致；
- 对 AI 来说，这会造成“普通搜索被限制，但 SQL 能穿透”的安全侧漏。

**结论**：这是当前最需要优先补上的权限漏洞之一。

#### 2. `block(action="recent_updated")` 也是全局返回，未做权限过滤
**现状**：`src/mcp/tools/block.ts` 中 `recent_updated` 直接调用 `getRecentUpdatedBlocks()`，没有任何 notebook 级权限裁剪。

**影响**：
- 最近更新列表天然带有“内容泄露入口”的属性；
- 即使用户把某个 notebook 设置为 `none`，这里仍可能泄露其块信息、标题、更新时间等元数据；
- 这与 README 中“权限会先解析块/文档所属笔记本再决定是否允许读取”的整体认知不一致。

**结论**：这是第二个需要和 `query_sql` 一起修的权限问题。

### P1 - 体验问题

#### 3. `document(action="search_docs")` 暴露了 `path` 参数，但实现里完全没用
**现状**：
- schema 中声明了 `path`；
- 说明文字写的是“可选 storage path 缩小范围”；
- 但 `src/mcp/tools/document.ts` 实际只调用 `documentApi.searchDocs(client, parsed.query)`，没有把 `path` 传下去，也没有在返回结果后做路径过滤。

**影响**：
- 用户或 AI 以为自己在“某个目录下搜索文档”，实际上拿到的是全局标题搜索结果；
- 这会直接影响工具可信度，因为参数表面可用、实际失效。

**结论**：这是典型的“接口契约与实现不一致”问题。

#### 4. `block(action="recent_updated")` 的 `count` 参数同样是死参数
**现状**：
- `src/mcp/tools/block.ts` schema 里有 `count`；
- 但调用底层 API 时并没有传递，也没有本地裁剪。

**影响**：
- AI 会以为自己能控制结果量，实际不能；
- 会增加 token 消耗，也会让自动化流程产生错误预期。

**结论**：这属于低实现成本、高体验收益的问题，应该顺手修掉。

#### 5. `document(action="list_tree")` 虽然补了 `name` / `icon`，但实现是典型 N+1
**现状**：`src/mcp/tools/document.ts` 中 `enrichTreeNodesWithDocInfo()` 会对 tree 里的节点逐个 `getDocInfo()` 补信息。

**影响**：
- 小树没问题；
- 树一大，延迟会明显上升；
- AI 场景里通常会把 `list_tree` 作为“先看结构”的入口，这个路径一旦变慢，首屏体验会打折。

**结论**：现在是“可用但不够优雅”，后续要考虑批量化或缓存。

#### 6. `get_backlinks` / `get_backmentions` 的“部分受限”语义还不够明确
**现状**：
- 当前实现遇到权限相关底层异常时，会返回空数组并附带 warning；
- 这比直接报错要好，但仍然不够精确。

**影响**：
- AI 很难区分“真的没有反链”与“有结果，但因为受限被全部吃掉了”；
- 如果 warning 被上层客户端忽略，语义就会退化成“假空结果”。

**结论**：这是一个结果表达层的问题，影响的是可解释性。

### P2 - 中低优先级问题

#### 7. 高危操作确认仍主要依赖 instruction 层约束
README 已写明：高危 action 的确认更多依赖 MCP client 是否展示 instructions，而不是服务端强制弹确认。

**影响**：
- 文档是诚实的，但真实体验仍容易因客户端差异而不一致；
- 用户会把“配置里写了需要确认”误解成“服务端一定挡得住误删”。

#### 8. 路径双轨制仍然有学习成本
虽然说明已经完善，但 `create/get_ids` 用 human-readable path、`move/remove/get_hpath(list_tree path 版)` 用 storage path，仍需要使用者牢牢记住。

**影响**：
- 对人类开发者还好；
- 对临时接入的 AI Agent 来说，仍属于容易踩坑的知识点。

---

## 四、典型 AI 用户场景体验

### 场景 1：「帮我创建一篇笔记并继续追加内容」
**流程**：`document(create)` -> `block(append)` -> `document(get_doc, mode="markdown")`

**体验**：顺滑。当前版本在“创建—写入—读取 Markdown”这条主链路上已经比较成熟。

### 场景 2：「帮我在某个目录下找标题包含 XXX 的文档」
**流程**：`document(search_docs, notebook, query, path)`

**体验**：存在误导。因为 `path` 现在并不生效，AI 会以为自己做了目录级过滤，实际没有。

### 场景 3：「帮我列出最近更新的内容」
**流程**：`block(recent_updated, count=20)`

**体验**：结果可能超出预期：
- 不能真正限制数量；
- 还可能带出受限 notebook 的更新信息。

### 场景 4：「帮我直接用 SQL 查数据」
**流程**：`search(query_sql)`

**体验**：能力很强，但安全边界最脆。对 AI 来说，这个 action 目前过于“强大而裸露”。

### 场景 5：「帮我看看这个文档有哪些反链」
**流程**：`search(get_backlinks)`

**体验**：比旧版更稳，但仍存在“空结果不够可解释”的问题。

---

## 五、修改计划

### 第一优先级：先补权限边界

#### Fix 1：为 `query_sql` 增加权限过滤或执行约束
- **文件**：`src/mcp/tools/search.ts`
- **建议方案**：
  - 方案 A：对 SQL 返回的 `blocks` / `spans` / `assets` 行做 notebook 权限过滤；
  - 方案 B：要求 `query_sql` 必须显式传 notebook / paths 范围，并在 MCP 层改写或包裹查询；
  - 方案 C：若短期难做安全过滤，先把 `query_sql` 默认从 fallback 配置中关闭。
- **优先级**：P0

#### Fix 2：为 `recent_updated` 增加权限过滤
- **文件**：`src/mcp/tools/block.ts`
- **建议方案**：
  - 先在返回结果上做 notebook 级过滤；
  - 若结果项缺少 notebook 信息，则通过块/文档上下文补解析；
  - 同时返回 `filteredOutCount`，避免“用户不知道结果被裁剪过”。
- **优先级**：P0

### 第二优先级：修正契约不一致

#### Fix 3：实现 `search_docs.path`，或者把它从 schema / 文档中去掉
- **文件**：`src/mcp/tools/document.ts`
- **关联文档**：`src/mcp/help.ts`、`README.md`、`README_zh_CN.md`
- **建议方案**：
  - 如果底层 API 不支持路径过滤，则在 MCP 层根据 storage path / hPath 做后过滤；
  - 如果短期不做实现，就删掉该参数，避免伪能力。
- **优先级**：P1

#### Fix 4：让 `recent_updated.count` 真的生效
- **文件**：`src/mcp/tools/block.ts`
- **建议方案**：
  - 若底层 API 不支持 count，就在 MCP 层 `slice(0, count)`；
  - 文档中同步说明“先过滤权限，再按 count 截断”。
- **优先级**：P1

### 第三优先级：提升可解释性与性能

#### Fix 5：优化 backlinks / backmentions 的部分失败表达
- **文件**：`src/mcp/tools/search.ts`
- **建议方案**：
  - 除 warning 外，再补 `partial: true`、`filteredOutCount`、`reason: "permission_filtered"`；
  - 避免客户端把 warning 丢掉后，空结果被误判为“确实没有”。
- **优先级**：P1

#### Fix 6：优化 `list_tree` 的节点信息补全策略
- **文件**：`src/mcp/tools/document.ts`
- **建议方案**：
  - 优先寻找可批量获取 name/icon 的方式；
  - 若底层 API 没有批量接口，至少加缓存，减少同次调用中的重复 `getDocInfo()`。
- **优先级**：P2

#### Fix 7：继续收敛路径语义文案
- **文件**：`src/mcp/help.ts`、`README.md`、`README_zh_CN.md`
- **建议方案**：
  - 所有 path 字段都明确标注是 `human-readable path` 还是 `storage path`；
  - 校验失败时直接提示“当前 path 类型不匹配”。
- **优先级**：P2

---

## 六、总结

当前版本的 `siyuan-plugins-mcp-sisyphus`，相比样例报告时期，已经修掉了几处最影响 AI 使用感的老问题：比如 `get_doc(markdown)` 的返回语义、`block(update)` 的精简结果、`fulltext(stripHtml)` 的纯文本辅助字段等。

但从“AI 真正可放心接入”的角度看，**现在最关键的不是再加新功能，而是继续补齐权限一致性**。尤其是：

1. `search(query_sql)` 的权限边界  
2. `block(recent_updated)` 的权限过滤  
3. `document(search_docs)` 的参数契约一致性  

如果先把这 3 个点修好，这个 MCP 的整体可信度会明显再上一个台阶。
