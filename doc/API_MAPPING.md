# SiYuan MCP Sisyphus API Mapping 文档

> 本文档汇总思源笔记内核 API 与 MCP 工具的映射关系，并标注尚未集成的接口。

---

## 📊 整体覆盖情况

| 类别 | 已集成 | 可新增 | 覆盖率 |
|------|--------|--------|--------|
| Notebook | 12/12 | 0 | 100% |
| Document | 16/16 | 0 | 100% |
| Block | 20/20 | 0 | 100% |
| Attribute View (数据库) | 10/12 | 2 | 83% |
| Search | 5/5 | 0 | 100% |
| File | 6/6 | 6+ | 50% |
| System | 10/10 | 10+ | 50% |
| Tag | 3/3 | 0 | 100% |
| UI Refresh | 0/5 | 5 | 0% |
| **总计** | **82/89** | **23+** | **78%** |

---

## ✅ 已集成的 API

### Notebook (笔记本)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `list` | `/api/notebook/lsNotebooks` | 列出所有笔记本 |
| `create` | `/api/notebook/createNotebook` | 创建笔记本 |
| `open` | `/api/notebook/openNotebook` | 打开笔记本 |
| `close` | `/api/notebook/closeNotebook` | 关闭笔记本 |
| `remove` | `/api/notebook/removeNotebook` | 删除笔记本 |
| `rename` | `/api/notebook/renameNotebook` | 重命名笔记本 |
| `get_conf` | `/api/notebook/getNotebookConf` | 获取笔记本配置 |
| `set_conf` | `/api/notebook/setNotebookConf` | 设置笔记本配置 |
| `set_icon` | `/api/notebook/setNotebookIcon` | 设置笔记本图标 |
| `get_permissions` | - | 获取笔记本权限 (本地实现) |
| `set_permission` | - | 设置笔记本权限 (本地实现) |
| `get_child_docs` | `/api/filetree/listDocsByPath` | 获取子文档列表 |

### Document (文档)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `create` | `/api/filetree/createDocWithMd` | 创建文档 |
| `rename` | `/api/filetree/renameDoc/renameDocByID` | 重命名文档 |
| `remove` | `/api/filetree/removeDoc/removeDocByID` | 删除文档 |
| `move` | `/api/filetree/moveDocs/moveDocsByID` | 移动文档 |
| `get_path` | `/api/filetree/getPathByID` | 获取存储路径 |
| `get_hpath` | `/api/filetree/getHPathByID/getHPathByPath` | 获取人类可读路径 |
| `get_ids` | `/api/filetree/getIDsByHPath` | 通过路径获取 ID |
| `get_child_blocks` | `/api/block/getChildBlocks` | 获取子块 |
| `get_child_docs` | `/api/filetree/listDocsByPath` | 获取子文档 |
| `set_icon` | `/api/attr/setBlockAttrs` | 设置文档图标 |
| `set_cover` | `/api/attr/setBlockAttrs` | 设置封面 |
| `clear_cover` | `/api/attr/setBlockAttrs` | 清除封面 |
| `list_tree` | `/api/filetree/listDocTree` | 列出文档树 |
| `search_docs` | `/api/filetree/searchDocs` | 搜索文档 |
| `get_doc` | `/api/filetree/getDoc` | 获取文档内容 |
| `create_daily_note` | `/api/filetree/createDailyNote` | 创建每日笔记 |

### Block (块)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `insert` | `/api/block/insertBlock` | 插入块 |
| `prepend` | `/api/block/prependBlock` | 前置插入 |
| `append` | `/api/block/appendBlock` | 追加插入 |
| `update` | `/api/block/updateBlock` | 更新块 |
| `delete` | `/api/block/deleteBlock` | 删除块 |
| `move` | `/api/block/moveBlock` | 移动块 |
| `fold` | `/api/block/foldBlock` | 折叠块 |
| `unfold` | `/api/block/unfoldBlock` | 展开块 |
| `get_kramdown` | `/api/block/getBlockKramdown` | 获取 Kramdown |
| `get_children` | `/api/block/getChildBlocks` | 获取子块 |
| `transfer_ref` | `/api/block/transferBlockRef` | 转移引用 |
| `set_attrs` | `/api/attr/setBlockAttrs` | 设置属性 |
| `get_attrs` | `/api/attr/getBlockAttrs` | 获取属性 |
| `exists` | `/api/block/checkBlockExist` | 检查存在性 |
| `info` | `/api/block/getBlockInfo` | 获取块信息 |
| `breadcrumb` | `/api/block/getBlockBreadcrumb` | 获取面包屑 |
| `dom` | `/api/block/getBlockDOM` | 获取 DOM |
| `recent_updated` | `/api/block/getRecentUpdatedBlocks` | 最近更新 |
| `word_count` | `/api/block/getBlocksWordCount` | 字数统计 |

### Attribute View (数据库)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `get` | `/api/av/getAttributeView` | 获取数据库 |
| `search` | `/api/av/searchAttributeView` | 搜索数据库 |
| `add_rows` | `/api/av/addAttributeViewBlocks` | 添加行 |
| `remove_rows` | `/api/av/removeAttributeViewBlocks` | 删除行 |
| `add_column` | `/api/av/addAttributeViewKey` | 添加列 |
| `remove_column` | `/api/av/removeAttributeViewKey` | 删除列 |
| `set_cell` | `/api/av/setAttributeViewBlockAttr` | 设置单元格 |
| `batch_set_cells` | `/api/av/batchSetAttributeViewBlockAttrs` | 批量设置 |
| `duplicate_block` | `/api/av/duplicateAttributeViewBlock` | 复制块 |
| `get_primary_key_values` | `/api/av/getAttributeViewPrimaryKeyValues` | 获取主键值 |

### Search (搜索)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `fulltext` | `/api/search/fullTextSearchBlock` | 全文搜索 |
| `query_sql` | `/api/query/sql` | SQL 查询 |
| `search_tag` | `/api/search/searchTag` | 搜索标签 |
| `get_backlinks` | `/api/ref/getBacklinkDoc` | 获取反向链接 |
| `get_backmentions` | `/api/ref/getBackmentionDoc` | 获取提及 |

### File (文件)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `upload_asset` | `/api/asset/upload` | 上传资源 |
| `render_template` | `/api/template/render` | 渲染模板 |
| `render_sprig` | `/api/template/renderSprig` | 渲染 Sprig |
| `export_md` | `/api/export/exportMdContent` | 导出 Markdown |
| `export_resources` | `/api/export/exportResources` | 导出资源 |

### System (系统)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `workspace_info` | `/api/system/getWorkspaceInfo` | 工作区信息 |
| `network` | `/api/system/getNetwork` | 网络信息 |
| `changelog` | `/api/system/getChangelog` | 更新日志 |
| `conf` | `/api/system/getConf` | 系统配置 |
| `sys_fonts` | `/api/system/getSysFonts` | 系统字体 |
| `boot_progress` | `/api/system/bootProgress` | 启动进度 |
| `push_msg` | `/api/notification/pushMsg` | 推送消息 |
| `push_err_msg` | `/api/notification/pushErrMsg` | 推送错误 |
| `get_version` | `/api/system/version` | 获取版本 |
| `get_current_time` | `/api/system/currentTime` | 获取时间 |

### Tag (标签)

| MCP Action | 思源 API | 说明 |
|------------|----------|------|
| `list` | `/api/tag/getTag` | 列出标签 |
| `rename` | `/api/tag/renameTag` | 重命名标签 |
| `remove` | `/api/tag/removeTag` | 删除标签 |

---

## 🆕 可新增的 API

### 1. UI 刷新类 (High Priority)

这些接口可以单独作为一个 `ui` 工具，用于控制思源界面刷新。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `reload_ui` | `/api/ui/reloadUI` | 刷新整个 UI | 主题切换后 |
| `reload_filetree` | `/api/ui/reloadFiletree` | 刷新文件树 | 文档操作后 |
| `reload_protyle` | `/api/ui/reloadProtyle` | 刷新编辑器 | 块更新后 |
| `reload_av` | `/api/ui/reloadAttributeView` | 刷新数据库视图 | 数据修改后 |
| `reload_tag` | `/api/ui/reloadTag` | 刷新标签 | 标签修改后 |

### 2. 文件系统操作类 (Medium Priority)

扩展 `file` 工具，添加文件系统操作。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `read_file` | `/api/file/getFile` | 读取文件内容 | 读取附件 |
| `write_file` | `/api/file/putFile` | 写入文件 | 写入配置 |
| `remove_file` | `/api/file/removeFile` | 删除文件 | 清理资源 |
| `rename_file` | `/api/file/renameFile` | 重命名文件 | 资源整理 |
| `read_dir` | `/api/file/readDir` | 读取目录 | 浏览资源 |
| `copy_file` | `/api/file/copyFiles` | 复制文件 | 备份资源 |

### 3. 导出类 (Medium Priority)

扩展 `file` 工具，添加更多导出格式。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `export_html` | `/api/export/exportHTML` | 导出 HTML | 网页发布 |
| `export_pdf` | `/api/export/exportPDF` | 导出 PDF | 文档分享 |
| `export_docx` | `/api/export/exportDocx` | 导出 Word | 办公协作 |
| `export_png` | `/api/export/exportPNG` | 导出图片 | 社交分享 |
| `pandoc` | `/api/convert/pandoc` | Pandoc 转换 | 格式转换 |

### 4. 历史版本类 (Medium Priority)

新增 `history` 工具，管理文档历史。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `get_doc_history` | `/api/history/getDocHistory` | 获取文档历史 | 版本回溯 |
| `get_history_items` | `/api/history/getHistoryItems` | 获取历史条目 | 查看变更 |
| `rollback_doc` | `/api/history/rollbackDoc` | 回滚文档 | 恢复旧版本 |
| `rollback_assets` | `/api/history/rollbackAssets` | 回滚资源 | 恢复资源 |
| `clear_workspace_history` | `/api/history/clearWorkspaceHistory` | 清理历史 | 释放空间 |

### 5. 闪卡类 (Low Priority)

新增 `flashcard` 工具，优先覆盖复习流。

> 注意：思源内核源码中不存在独立的 `/api/riff/getRiffNewCards` 接口。建议将查询能力收敛为一个通用 `list_cards` action，底层统一调用 `*DueCards` 系列接口，再由 MCP 按卡片 `state` 过滤出 `new` / `old`。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `list_cards` | `/api/riff/getRiffDueCards` / `/api/riff/getNotebookRiffDueCards` / `/api/riff/getTreeRiffDueCards` | 统一查询待复习卡片，并支持 `filter=due/new/old` | 每日复习、学习新内容 |
| `get_decks` | `/api/riff/getRiffDecks` | 获取卡包列表 | 发现 `deckID` |
| `review_card` | `/api/riff/reviewRiffCard` | 复习卡片 | 标记掌握度 |
| `skip_review_card` | `/api/riff/skipReviewRiffCard` | 跳过当前卡片 | 复习流控制 |
| `add_card` | `/api/riff/addRiffCards` | 添加卡片 | 创建闪卡 |
| `remove_card` | `/api/riff/removeRiffCards` | 删除卡片 | 移除闪卡 |

建议入参设计：

- `list_cards(scope="all" | "deck" | "notebook" | "tree", filter="due" | "new" | "old")`
- `scope="deck"` 搭配 `deckID`
- `scope="notebook"` 搭配 `notebook`
- `scope="tree"` 搭配 `rootID`
- `review_card(deckID, cardID, rating, reviewedCards?)`
- `skip_review_card(deckID, cardID)`
- `add_card(deckID, blockIDs)`
- `remove_card(deckID, blockIDs)`

建议返回结构：

- `list_cards` 保留内核原始计数字段：
  - `cards`
  - `unreviewedCount`
  - `unreviewedNewCardCount`
  - `unreviewedOldCardCount`
- `cards[*]` 以源码 `Flashcard` 结构为准，至少包含：
  - `deckID`
  - `cardID`
  - `blockID`
  - `lapses`
  - `reps`
  - `state`
  - `lastReview`
  - `nextDues`

实现备注：

- 闪卡“标记”仍建议继续使用 `block(action="set_attrs", attrs={"custom-riff-decks":"<deck-id>"})`
- `add_card` / `remove_card` 作用于**已有块**，不是新建独立卡片内容
- `remove_card` 建议按删除类危险操作处理

### 6. 网络代理类 (Low Priority)

扩展 `system` 工具，添加网络请求能力。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `forward_proxy` | `/api/network/forwardProxy` | 正向代理请求 | API 调用 |

### 7. 剪贴板类 (Low Priority)

新增 `clipboard` 工具，操作剪贴板。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `read_clipboard` | `/api/clipboard/read` | 读取剪贴板 | 粘贴内容 |
| `write_clipboard` | `/api/clipboard/write` | 写入剪贴板 | 复制内容 |

### 8. 资源文件类 (Low Priority)

扩展 `file` 工具，添加资源文件操作。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `resolve_asset` | `/api/asset/resolveAsset` | 解析资源路径 | 图片引用 |
| `upload_assets` | `/api/asset/batchUpload` | 批量上传 | 多图上传 |

### 9. 设置类 (Low Priority)

扩展 `system` 工具，添加设置操作。

| 建议 Action | 思源 API | 说明 | 使用场景 |
|-------------|----------|------|----------|
| `set_account` | `/api/account/setAccount` | 设置账户 | 云端同步 |
| `login` | `/api/account/login` | 登录 | 账户认证 |
| `logout` | `/api/account/logout` | 登出 | 退出账户 |

---

## 🔌 事务 (Transaction) API

事务 API 已在 `src/api/transaction.ts` 中定义，但尚未暴露为 MCP 工具。

| API | 说明 | 建议集成方式 |
|-----|------|-------------|
| `/api/transactions` | 批量执行原子操作 | 内部使用或高级 block 操作 |

**建议**: 作为内部实现使用，不直接暴露给用户，而是在 block 批量操作时使用。

---

## 📈 优先级建议

### Phase 1: 核心功能完善 (立即)
- [ ] UI 刷新类 API (`ui` 工具)
- [ ] `av.get_mirror_blocks` - 获取镜像数据库块

### Phase 2: 文件系统增强 (近期)
- [ ] 文件读写操作 (`file.read_file`, `file.write_file`)
- [ ] 目录浏览 (`file.read_dir`)
- [ ] 更多导出格式 (`file.export_html`, `file.export_pdf`)

### Phase 3: 高级功能 (中期)
- [ ] 历史版本管理 (`history` 工具)
- [ ] 闪卡系统 (`flashcard` 工具)

### Phase 4: 生态扩展 (远期)
- [ ] 网络代理 (`system.forward_proxy`)
- [ ] 剪贴板操作 (`clipboard` 工具)
- [ ] 账户管理 (`system.login/logout`)

---

## 📝 实现注意事项

1. **UI 刷新 API**: 需要文档 ID 参数，应在 block/document 操作后自动调用
2. **文件系统 API**: 需要注意权限控制，限制在工作区目录内
3. **导出 API**: 返回文件路径，可能需要配合文件读取
4. **历史版本 API**: 涉及数据恢复，需要用户确认
5. **网络代理 API**: 有安全风险，需要谨慎评估

---

*最后更新: 2026-04-08*
