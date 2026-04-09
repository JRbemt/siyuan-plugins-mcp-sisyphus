# SiYuan MCP Sisyphus API 更新建议

> 基于 API Mapping 分析，提出的具体更新建议

---

## 🎯 本次更新目标

根据团队体验报告反馈和 API 覆盖分析，建议优先添加以下接口：

1. **UI 自动刷新控制** - 提升用户体验一致性
2. **更多导出格式** - 满足不同发布需求
3. **文件系统操作** - 支持资源管理
4. **数据库镜像块** - 完善 AV 功能

---

## 📋 具体建议

### 建议 1: 新增 `ui` 工具 (High Priority)

**理由**: 当前 MCP 操作后通过内部机制触发 UI 刷新，但用户无法手动控制刷新时机，也无法刷新特定视图。

**建议 Actions**:

```typescript
// src/mcp/config.ts
export const UI_ACTIONS = ['reload_ui', 'reload_filetree', 'reload_protyle', 'reload_av', 'reload_tag'] as const;
```

| Action | 参数 | 说明 |
|--------|------|------|
| `reload_ui` | - | 刷新整个思源界面 |
| `reload_filetree` | - | 刷新文档树 |
| `reload_protyle` | `id: string` | 刷新指定编辑器 |
| `reload_av` | `id: string` | 刷新数据库视图 |
| `reload_tag` | - | 刷新标签面板 |

**使用场景**:
- 批量操作后统一刷新
- 外部修改后同步显示
- 主题/设置切换后生效

---

### 建议 2: 扩展 `av` 工具 (Medium Priority)

**理由**: 团队体验中发现数据库功能强大，但缺少获取镜像块的能力。

**新增 Action**:

```typescript
// 添加到 AV_ACTIONS
'get_mirror_blocks'
```

| Action | 参数 | 说明 |
|--------|------|------|
| `get_mirror_blocks` | `avID: string` | 获取镜像数据库块列表 |

**已有 API**: `src/api/av.ts` 中的 `getMirrorDatabaseBlocks`

---

### 建议 3: 扩展 `file` 工具 (Medium Priority)

**理由**: 体验报告提到缺少批量导入功能，且用户需要直接操作资源文件。

**新增 Actions**:

```typescript
// 添加到 FILE_ACTIONS
'read_file' | 'write_file' | 'read_dir' | 'export_html' | 'export_pdf'
```

| Action | 参数 | 说明 |
|--------|------|------|
| `read_file` | `path: string` | 读取资源文件内容 |
| `write_file` | `path: string, content: string` | 写入资源文件 |
| `read_dir` | `path: string` | 列出目录内容 |
| `export_html` | `id: string` | 导出 HTML 格式 |
| `export_pdf` | `id: string` | 导出 PDF 格式 |

**注意事项**:
- `read_file`/`write_file` 需要限制在工作区 `assets` 目录
- 导出功能需要处理异步任务状态

---

### 建议 4: 新增 `history` 工具 (Low Priority)

**理由**: 用户体验中提到担心误操作，历史版本功能可以提供安全保障。

**建议 Actions**:

```typescript
export const HISTORY_ACTIONS = ['get_doc_history', 'rollback_doc', 'clear_history'] as const;
```

| Action | 参数 | 说明 |
|--------|------|------|
| `get_doc_history` | `notebook: string, path: string` | 获取文档历史版本 |
| `rollback_doc` | `historyPath: string` | 回滚到指定版本 |
| `clear_history` | - | 清理历史记录 |

**风险**: `rollback_doc` 和 `clear_history` 需要用户确认

---

## 🔧 实现优先级

```
Phase 1 (v0.2.0)
├── ui.reload_protyle      # 最常用
├── ui.reload_filetree     # 批量操作后
└── av.get_mirror_blocks   # 完善数据库

Phase 2 (v0.2.x)
├── file.read_file         # 资源读取
├── file.read_dir          # 资源浏览
├── file.export_html       # 网页发布
└── file.export_pdf        # 文档分享

Phase 3 (v0.3.0)
├── history.get_doc_history
├── history.rollback_doc
└── ui.reload_ui
```

---

## 📊 更新影响评估

| 工具 | 新增 Actions | 破坏性变更 | 用户收益 |
|------|-------------|-----------|----------|
| `ui` | 5 | 无 | ⭐⭐⭐⭐⭐ |
| `av` | 1 | 无 | ⭐⭐⭐ |
| `file` | 5 | 无 | ⭐⭐⭐⭐ |
| `history` | 3 | 无 | ⭐⭐⭐ |

**总计**: 14 个新 Actions，无破坏性变更

---

## 🎁 额外建议

### 1. SQL 时间格式统一

**问题**: 体验报告中提到 SQL 返回时间格式 `20260219162616` 与其他地方不一致。

**建议**: 在 `search(action="query_sql")` 返回结果中，自动转换时间字段为 ISO 8601 格式。

```typescript
// 伪代码
function normalizeSqlResult(rows: any[]) {
    return rows.map(row => ({
        ...row,
        created: row.created ? formatTimestamp(row.created) : null,
        updated: row.updated ? formatTimestamp(row.updated) : null,
    }));
}
```

### 2. 搜索结果精简模式

**问题**: PM 反馈搜索结果字段过多。

**建议**: 在 `search(action="fulltext")` 中添加 `compact: boolean` 参数，只返回核心字段。

```typescript
// compact=true 时返回
{
    id: string;
    hPath: string;
    content: string;  // 带高亮
    type: string;
}
```

### 3. 批量块操作

**问题**: 缺少批量创建/更新块的能力。

**建议**: 使用已有的 `transaction.ts` 实现批量操作。

```typescript
// block(action="batch_append")
{
    parentID: string;
    items: Array<{ dataType: 'markdown', data: string }>;
}
```

---

*文档生成时间: 2026-04-08*
