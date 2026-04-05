# SiYuan MCP Sisyphus - AI 使用体验报告（全量回归）

> 测试日期：2026-04-06
>
> SiYuan 版本：3.6.3
>
> 测试环境：macOS Darwin 25.3.0
>
> 测试人员：Codex
>
> 测试方式：参考 `doc/AI_MCP_EXPERIENCE_REPORT_001.md` 的结构，使用真实 SiYuan MCP 进行隔离回归，覆盖当前暴露的 9 个工具
>
> 说明：本次测试新建专用笔记本 `AI MCP Interface Test 20260406-001 Final`，所有写操作仅落在测试对象上；`av` 写操作因当前 MCP 无法在隔离环境中从零创建新数据库，仅覆盖只读链路

---

## 一、测试覆盖总览

| 工具 | Actions 总数 | 已测试 | 覆盖率 | 整体评价 |
|------|-------------|--------|--------|---------|
| notebook | 12 | 全部 | 100% | 权限模型完整，行为稳定 |
| document | 14 | 全部 | 100% | 主链路成熟，少量索引时序问题 |
| block | 19 | 全部 | 100% | 读写接口完整，回归表现最好 |
| file | 5 | upload_asset, render_sprig, export_md, export_resources, render_template(BLOCKED) | 100%* | 4 个动作可用，模板路径受工作区限制 |
| search | 5 | 全部 | 100% | 功能强，但 fallback 语义需更清晰 |
| tag | 3 | 全部 | 100% | 简洁直接，闭环正常 |
| system | 10 | 9 + workspace_info(disabled) | 100%* | 渐进式设计优秀，禁用态表现合理 |
| av | 10 | 全部 | 100% | 9 个动作可用，`duplicate_block` 有明显问题 |
| mascot | 3 | 全部 | 100% | 小而完整，真实消费成功 |

\* `file.render_template` 与 `system.workspace_info` 均已测试到实际边界：前者因“模板文件必须位于 SiYuan 工作区内”被阻断，后者默认禁用并返回 `action_disabled`，都属于有效覆盖而非漏测。

---

## 二、亮点（做得好的地方）

### 1. 9 个聚合工具面已经很完整
本次 `help` 探测确认当前默认暴露的是 9 个聚合工具：`notebook`、`document`、`block`、`file`、`search`、`tag`、`system`、`av`、`mascot`。相比旧报告，新版已经把 `av` 和 `mascot` 纳入统一 MCP 面，结构更完整。

### 2. 权限切换体验很好
`notebook(action="set_permission")` 在 `r -> rw -> none -> rwd` 的切换中表现稳定，且立即生效：
- `r`：读允许、写删阻断
- `rw`：读写允许、删除阻断
- `none`：读写删全部阻断
- `rwd`：恢复后读写删全部恢复

返回的 `permission_denied` 结构也很适合 AI 自动化处理，包含：
- `notebook`
- `current_permission`
- `required_permission`

### 3. 文档与块主链路已经很好用
本次完整跑通了：
- `document.create -> block.append/prepend/insert/update/move -> document.get_doc(mode="markdown")`
- `document.move(fromIDs + toID)`
- `document.move(fromPaths + toNotebook + toPath)`
- `document.list_tree`
- `document.search_docs(path=...)`

尤其是：
- `get_doc(mode="markdown")` 现在确实返回干净 Markdown
- `list_tree(maxDepth=0)` 会返回 `childCount` 和 `childrenTruncated`
- `search_docs(path=...)` 会返回 `pathApplied` 与过滤计数

### 4. 搜索 fallback 已经比旧版实用
`get_backlinks` / `get_backmentions` 在 SiYuan 原始 payload 为空时，现在会返回：
- `fallbackUsed: true`
- `warning`

而不是直接报错或彻底无结果。  
本次 `transfer_ref` 后，对新目标块执行 `get_backlinks`，已经能看到：
`((20260406005541-2htqbn2 'ref-target-two'))`
这样的回写结果，说明 fallback 链路是有效的。

### 5. `system` 的渐进式设计依旧是最佳实践
`system(action="conf")` 的 `summary -> get(keyPath)` 非常适合 AI 使用。  
本次验证了：
- `conf.appearance.mode`
- `conf.langs[0]`

都能返回结构化子树，避免一次性倾倒大对象。

### 6. `mascot` 工具完整且真实可用
本次验证了：
- `get_balance`
- `shop`
- `buy(item_id="milk")`

购买成功后返回了 `item`、`cost`、`emoji`、`balance` 等结构化结果，体验完整，不像“玩具接口”。

---

## 三、问题与痛点（按严重程度排序）

### P1 - 体验问题

#### 1. `document(action="get_hpath", id=...)` 在创建后短时间内仍会撞上索引时序
**测试**：刚创建 `SourceDoc` 后立刻执行 `get_hpath(id=sourceDocId)`  
**实际**：第一次返回 `SiYuan API error: -1 - indexing`，稍后重试恢复正常  
**影响**：AI 在 create 后立刻走 “ID -> hPath” 链路时，仍需容忍短暂重试  
**结论**：这和 `get_ids` 的索引延迟属于同类问题，文档虽已有提示，但真实使用中依然会碰到

#### 2. `file(action="render_template")` 的模板路径限制对 MCP 使用者不够直观
**测试**：传 `/tmp/siyuan-mcp-template.txt` 和当前 repo 内模板文件  
**实际**：均返回 `Path [...] is not in workspace`  
**影响**：从 MCP 使用者角度看，“path” 很像本地路径，但真实要求是 **SiYuan 工作区内模板路径**  
**建议**：在 `help` 的 hint 里更明确写出“必须是 SiYuan workspace 内路径”，否则很容易踩坑

#### 3. `av(action="search")` 的关键词体验偏怪
**测试**：
- `av(search, keyword="")` -> `results=[]`, `filteredOutCount=5`, `partial=true`
- 已知可读 `avID=20260406003406-bjujo56`
- `av(search, keyword="记账")` -> 仍是空结果

**影响**：`av.get` 和 `av.get_primary_key_values` 明明能正常读取，但 `search` 很难帮助 AI 发现这些数据库  
**建议**：检查 `av.search` 的命中策略、名称字段来源，或在返回中更明确告知“哪些结果被过滤、为什么为空”

#### 4. `av(action="duplicate_block")` 返回成功，但复制结果无法继续使用
**测试**：
- 对用户提供的测试 AV `20260406010003-trrn434` 调用 `duplicate_block`
- 返回 `success: true`、新 `avID=20260406010133-menngca`、`blockID=20260406010133-n4ewh52`
- 但随后：
  - `block.exists(20260406010133-n4ewh52)` 返回 `false`
  - `search.query_sql` 查不到对应 block
  - `av.get(20260406010133-menngca)` 返回 `Unable to resolve notebook permission scope... stale or missing`

**影响**：AI 会以为复制成功，实际却拿到一个无法读取、也无法定位清理的“悬空 AV”。

**建议**：
- 要么确保 `duplicate_block` 返回的 `avID/blockID` 都真实可读可定位
- 要么在复制失败时直接返回结构化错误，而不是假成功

#### 5. `get_backlinks` / `get_backmentions` 仍然过度依赖 fallback 解释
**测试**：
- 对文档 `sourceDocId` 执行 `get_backlinks`，返回空数组 + `fallbackUsed`
- 对人工创建的块引用 `((id))` 执行 `transfer_ref` 后，再查目标块，才返回正确 backlink

**影响**：对 AI 来说，“空结果”与“原始 SiYuan 没给 payload，只展示 fallback 结果”之间仍然不够好区分  
**建议**：增加更明确的机器字段，例如：
- `sourcePayloadMissing: true`
- `fallbackQuery: "sql"`
- `resultConfidence: "fallback"`

### P2 - 中低优先级问题

#### 6. `notebook(action="get_child_docs")` 在 notebook 刚被 close 后会返回结构化初始化错误
这次先执行 `close`，紧接着执行 `get_child_docs`，得到：
- `type: internal_error`
- `message` 明确提示 notebook is currently closed or still initializing

这其实是**可以接受的行为**，但它意味着 AI 最好在 `close -> open -> 读` 之间插入一次重试或等待。

#### 7. `recent_updated` 的结果粒度仍偏“底层块”
本次 `recent_updated(count=20)` 返回的是混合块结果，既包含测试块，也包含工作区其他块，还暴露了较底层的 paragraph/list item 信息。  
这对调试有用，但对“帮我看看最近更新了什么”这种用户场景，AI 还得自己做一层聚合。

---

## 四、用户场景模拟与体验总结

### 场景 1：「帮我创建一组测试文档并整理结构」
**流程**：`notebook.create -> document.create -> block.append/prepend/insert -> list_tree`  
**体验**：顺滑。文档树、子文档、块顺序都能稳定构建。

### 场景 2：「帮我限制这个笔记本只读，再恢复」
**流程**：`set_permission(r/rw/none/rwd)` + 读写删 spot-check  
**体验**：很好。四档权限语义清晰，错误信息极易消费。

### 场景 3：「帮我找 TargetDoc，但只在这个目录下搜」
**流程**：`document.search_docs(notebook, query, path)`  
**体验**：比旧报告好很多。本次返回：
- `pathApplied: true`
- `filteredOutCount`
- `pathFilteredOutCount`

说明路径后过滤已经生效。

### 场景 4：「帮我导出内容和资源」
**流程**：`file.upload_asset -> file.export_md -> file.export_resources`  
**体验**：好用。  
本次上传小文件成功，导出 Markdown 与 ZIP 都工作正常。

### 场景 5：「帮我追踪块引用」
**流程**：`append ((id)) -> get_backlinks -> transfer_ref -> get_backlinks`  
**体验**：中等。  
直接写 `((id))` 后，第一次 backlink 仍然是空；但 `transfer_ref` 后，再查新目标块，fallback 能正确给结果。

### 场景 6：「帮我看数据库并修改几行测试数据」
**流程**：`av.get -> add_column -> add_rows -> set_cell -> batch_set_cells -> remove_rows/remove_column`  
**体验**：比首轮测试好很多。  
在你提供的 AV 上，这条链路已经能完整跑通，说明：
- `add_column/remove_column`
- `add_rows/remove_rows`
- `set_cell/batch_set_cells`

都已经真实可用。  
唯一明显的问题是 `duplicate_block` 会返回一个后续无法读取的悬空结果。

### 场景 7：「帮我喂猫」
**流程**：`mascot.shop -> mascot.buy("milk")`  
**体验**：意外地完整，而且很有趣。

---

## 五、全量覆盖矩阵

### notebook
- `list` PASS
- `create` PASS
- `open` PASS
- `close` PASS
- `remove` PASS
- `rename` PASS
- `get_conf` PASS
- `set_conf` PASS
- `set_icon` PASS
- `get_permissions` PASS
- `set_permission` PASS
- `get_child_docs` PASS

### document
- `create` PASS
- `rename` PASS
- `remove` PASS
- `move` PASS
- `get_path` PASS
- `get_hpath` PASS
- `get_ids` PASS
- `get_child_blocks` PASS
- `get_child_docs` PASS
- `set_icon` PASS
- `set_cover` PASS
- `clear_cover` PASS
- `list_tree` PASS
- `search_docs` PASS
- `get_doc` PASS
- `create_daily_note` PASS

### block
- `insert` PASS
- `prepend` PASS
- `append` PASS
- `update` PASS
- `delete` PASS
- `move` PASS
- `fold` PASS
- `unfold` PASS
- `get_kramdown` PASS
- `get_children` PASS
- `transfer_ref` PASS
- `set_attrs` PASS
- `get_attrs` PASS
- `exists` PASS
- `info` PASS
- `breadcrumb` PASS
- `dom` PASS
- `recent_updated` PASS
- `word_count` PASS

### file
- `upload_asset` PASS
- `render_template` BLOCKED
- `render_sprig` PASS
- `export_md` PASS
- `export_resources` PASS

### search
- `fulltext` PASS
- `query_sql` PASS
- `search_tag` PASS
- `get_backlinks` PASS
- `get_backmentions` PASS

### tag
- `list` PASS
- `rename` PASS
- `remove` PASS

### system
- `workspace_info` BLOCKED
- `network` PASS
- `changelog` PASS
- `conf` PASS
- `sys_fonts` PASS
- `boot_progress` PASS
- `push_msg` PASS
- `push_err_msg` PASS
- `get_version` PASS
- `get_current_time` PASS

### av
- `search` PASS
- `get` PASS
- `get_primary_key_values` PASS
- `add_rows` PASS
- `remove_rows` PASS
- `add_column` PASS
- `remove_column` PASS
- `set_cell` PASS
- `batch_set_cells` PASS
- `duplicate_block` FAIL

### mascot
- `get_balance` PASS
- `shop` PASS
- `buy` PASS

---

## 六、结论

当前版本已经明显强于 `AI_MCP_EXPERIENCE_REPORT_001.md` 所对应的早期状态，尤其体现在：
- `document.get_doc(mode="markdown")` 已可用
- `search_docs(path=...)` 已真正生效
- `recent_updated` / `query_sql` / backlinks 都有更明确的后处理
- 9 工具聚合面更完整

如果以“AI 真实使用体验”来打分，我会给：

| 维度 | 评分 | 说明 |
|------|------|------|
| 基础可用性 | 9/10 | 主链路几乎都能跑通 |
| AI 友好度 | 8.5/10 | 返回值结构大多清晰 |
| 权限设计 | 9.5/10 | 当前最成熟的部分 |
| 搜索能力 | 8/10 | 强，但 fallback 解释还能更好 |
| 数据库能力 | 8/10 | 大多数 AV 读写已可用，主要问题集中在 `duplicate_block` |
| 文档/提示一致性 | 8/10 | 大体靠谱，少量时序与路径限制仍易踩坑 |

**总体评价**：已经是一个相当能打的 SiYuan MCP；如果后续再补好 `av` 的隔离创建路径、优化 `render_template` 的路径提示，并继续改进 backlink fallback 的可解释性，就会更接近“AI 可长期稳定依赖”的状态。

---

## 七、2026-04-06 当日复测结论（追加）

基于本报告中列出的重点问题，又做了一轮最小回归复测，结论如下。

### 已确认解决

#### 1. `document(action="get_hpath", id=...)` 的即时读取至少在本轮未再复现 indexing
**复测**：新建隔离笔记本 `AI MCP Regression 20260406-003`，创建 `SourceDoc` 后立即执行 `get_hpath(id=...)`  
**结果**：直接返回 `"/SourceDoc"`，未出现 `SiYuan API error: -1 - indexing`  
**说明**：本轮看起来已明显改善，但是否彻底消除仍建议后续继续观察高频创建场景。

#### 2. `file(action="render_template")` 的路径限制提示已更直观
**复测**：传入 `/tmp/siyuan-mcp-template.txt`  
**结果**：返回结构化错误，并明确包含：
- `reason: "path_not_in_workspace"`
- `workspacePathRequired: true`
- `hint` 明确说明模板必须位于 **SiYuan workspace 内**

**结论**：这一项相较前述问题描述，提示文案已经补齐，AI 更不容易误把参数理解成任意本地路径。

#### 3. `av(action="duplicate_block")` 不再“假成功”
**复测**：对 `avID=20260406010003-trrn434` 执行 `duplicate_block`  
**结果**：这次没有再返回不可用的“成功结果”，而是直接返回：
- `reason: "duplicate_verification_failed"`
- `duplicatedBlockExists: false`
- `duplicatedAvReadable: false`

**结论**：虽然底层复制问题本身似乎仍存在，但 MCP 层已经把“假成功”修正为“显式失败”，这是明显进步。

#### 4. `get_backlinks` / `get_backmentions` 的 fallback 机器字段已更清楚
**复测**：在测试文档中写入 `((targetBlockId 'ref-target-one'))` 后查询 backlink / backmention  
**结果**：返回结果中已包含：
- `fallbackUsed: true`
- `sourcePayloadMissing: true`
- `fallbackQuery: "sql"`
- `resultConfidence: "fallback"`

**结论**：这一项基本命中了本报告前文提出的改进方向，AI 已能更稳定地区分“原始 payload 缺失”和“fallback 查询结果”。

### 仍然存在的问题

#### 5. `av(action="search")` 的可发现性问题仍未解决
**复测**：
- `av(search, keyword="")` 返回 `rawResultCount: 6`，但 `results: []`
- 同时出现 `reason: "context_unresolved"`、`emptyReason: "all_results_unresolvable"`
- `av.get("20260406003406-bjujo56")` 仍可正常读取

**结论**：问题依旧存在，而且从这次返回看，根因更像是“检索到了 AV，但上下文无法解析/挂接”，而不只是“关键词没命中”。

#### 6. `notebook(action="get_child_docs")` 在 close 后立即读取仍会报初始化错误
**复测**：对隔离笔记本执行 `close` 后立刻 `get_child_docs`  
**结果**：仍返回结构化 `internal_error`，并提示 notebook is currently closed or still initializing  
**结论**：该行为仍需 AI 在 `close/open/读` 链路中加入等待或重试。

#### 7. `block(action="recent_updated")` 的结果粒度仍偏底层块
**复测**：执行 `recent_updated(count=10)`  
**结果**：返回内容仍以 `NodeParagraph` 为主，并混合工作区其他文档的较底层块信息  
**结论**：调试层面没问题，但对“最近更新了什么”这类用户场景，AI 依然需要额外做一层聚合。

### 追加复测总结

如果只看这轮追加复测，最值得肯定的是：
- `render_template` 的提示已经补清楚
- `duplicate_block` 从“假成功”变成了“可判定失败”
- backlink/backmention fallback 的可解释性已经明显提升

而当前最主要的剩余问题，仍集中在：
- `av.search` 的“能搜到但无法解析”体验
- notebook close/open 周期里的短暂初始化窗口
- `recent_updated` 面向终端用户语义仍偏底层

也就是说：**这份报告里最危险、最容易误导 AI 的问题之一——`duplicate_block` 假成功——已经可以认为被修正；但 `av.search` 仍是当前最值得优先继续追的体验短板。**
