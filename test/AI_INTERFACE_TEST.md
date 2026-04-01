# SiYuan MCP 接口 AI 测试手册

这是一份**给 AI 执行**的接口测试手册。  
目标是让 AI 在尽量少猜测的前提下，对当前 MCP 暴露的 `notebook` / `document` / `block` / `file` 四类工具进行**系统化回归测试**，重点覆盖：

- 聚合工具是否正确暴露
- 文档路径语义是否正确
- 树形查询是否正确
- 权限拦截是否有效
- 常见读写操作是否正常

---

## 1. 适用范围

本手册适用于当前插件版本的以下能力：

- `notebook(action="get_child_docs")`
- `document(action="get_child_blocks")`
- `document(action="get_child_docs")`
- `block` 工具基于块 / 文档 ID 的权限校验
- `document.get_path` / `document.get_hpath(id=...)` 的读权限校验
- `document.move` 的来源与目标权限校验

---

## 2. AI 执行规则

AI 在执行本手册时，必须遵守以下规则：

1. **只能操作自己创建的测试笔记本和测试文档**，不要改动用户已有内容。
2. 测试笔记本名称统一使用：
   - `AI MCP Interface Test <时间戳>`
3. 每一步都要记录：
   - 调用的 tool
   - 参数
   - 返回结果
   - 是否符合预期
4. 如果某一步失败：
   - 记录 `FAIL`
   - 保留实际返回
   - 在不破坏环境的前提下继续执行后续测试
5. 如果某个 action 没有暴露出来：
   - 记录为 `BLOCKED`
   - 不要伪造结果
6. 所有高风险删除 / 移动动作，只允许针对**测试过程中创建的对象**执行。
7. 测试结束后必须做清理：
   - 删除测试文档
   - 删除测试笔记本
   - 恢复测试过程中修改过的权限

---

## 3. 通过标准

只有同时满足以下条件，才能判定本轮测试通过：

1. `listTools()` 中能看到预期 action
2. 树形查询结果符合“**只返回直属子项**”的约定
3. 路径相关接口符合：
   - `create.path` 使用人类可读路径
   - `get_path` 返回存储路径
   - `get_hpath` / `get_ids` 转换正确
4. 权限测试中，被禁止的调用必须返回 `permission_denied`
5. 权限恢复后，读写操作恢复正常
6. 清理完成，无遗留测试对象

---

## 4. 执行前检查

AI 先执行以下检查：

### 4.1 工具可见性检查

确认存在以下 4 个聚合工具：

- `notebook`
- `document`
- `block`
- `file`

### 4.2 关键 action 检查

确认至少包含以下 action：

#### notebook

- `list`
- `create`
- `open`
- `close`
- `rename`
- `get_conf`
- `set_conf`
- `get_permissions`
- `set_permission`
- `get_child_docs`

#### document

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`

#### block

- `append`
- `prepend`
- `insert`
- `update`
- `delete`
- `move`
- `fold`
- `unfold`
- `get_kramdown`
- `get_children`
- `set_attrs`
- `get_attrs`

#### file

- `get_version`
- `get_current_time`
- `render_sprig`
- `export_md`

如果缺少任一关键 action，记录 `BLOCKED` 并在最终报告里指出。

### 4.3 四类 tool 权限预热

为了避免 AI 在测试进行到一半时，首次调用某个 tool 才弹出权限确认而卡住，需要在**测试刚开始阶段**主动把 4 个聚合 tool 都至少调用一次。

这一步按两阶段执行，避免使用“任意现有对象”造成歧义：

#### 阶段 A：创建测试对象前先预热能直接调用的 tool

1. `notebook(action="list")`
2. `file(action="get_version")`

#### 阶段 B：创建最小测试对象后再预热依赖对象 ID 的 tool

完成以下最小准备后再继续：

1. 创建测试笔记本，得到 `testNotebookId`
2. 在该笔记本下创建 `/SourceDoc`，得到 `sourceDocId`

然后立即执行：

3. `document(action="get_path", id=sourceDocId)`
4. `block(action="get_children", id=sourceDocId)`

#### 说明

- 这一步的目标是**提前触发 4 个 tool 的权限请求**，不是验证业务功能。
- `document` 与 `block` 的预热**不要**依赖用户已有对象，统一使用测试过程中刚创建的 `sourceDocId`。
- 这 4 次调用本身也要记录进测试日志，但不单独计入 T01–T23 的结果。
- 只有在四个 tool 都至少被调用过一次之后，才进入正式测试步骤。

---

## 5. 测试数据约定

AI 需要创建一套固定结构的数据，后续所有测试尽量复用。

### 5.1 测试笔记本

创建一个测试笔记本：

```json
{
  "action": "create",
  "name": "AI MCP Interface Test <timestamp>"
}
```

保存返回的：

- `testNotebookId`

### 5.2 测试文档结构

在该笔记本中创建以下文档：

#### 根级文档

- `/SourceDoc`
- `/TargetDoc`
- `/PathMoveDoc`
- `/DeleteDoc`

#### 子文档

- `/TargetDoc/ChildDoc`

创建后保存以下 ID：

- `sourceDocId`
- `targetDocId`
- `pathMoveDocId`
- `deleteDocId`
- `childDocId`

---

## 6. 详细测试步骤

---

### T01 - notebook 基础读能力

#### 目标

验证 notebook 基本接口可用。

#### 步骤

1. `notebook(action="list")`
2. `notebook(action="get_conf", notebook=testNotebookId)`
3. `notebook(action="open", notebook=testNotebookId)`
4. `notebook(action="close", notebook=testNotebookId)`
5. 再次 `notebook(action="open", notebook=testNotebookId)`

#### 预期

- `list` 返回数组，且包含测试笔记本
- `get_conf` 返回配置对象
- `open` / `close` / 再次 `open` 返回成功

---

### T02 - notebook 权限查询

#### 目标

验证 notebook 权限接口存在且返回格式正确。

#### 步骤

1. `notebook(action="get_permissions")`

#### 预期

- 返回包含 `notebooks` 数组
- 数组中存在 `id = testNotebookId` 的条目
- 该条目至少包含：
  - `id`
  - `name`
  - `permission`

---

### T03 - notebook 根级子文档查询

#### 目标

验证 `notebook(action="get_child_docs")` 只返回测试笔记本根下直属文档。

#### 步骤

调用：

```json
{
  "action": "get_child_docs",
  "notebook": "<testNotebookId>"
}
```

#### 预期

返回数组，并满足：

- 包含：
  - `sourceDocId`
  - `targetDocId`
  - `pathMoveDocId`
  - `deleteDocId`
- **不包含**：
  - `childDocId`

说明：

- `ChildDoc` 是 `TargetDoc` 的子文档，不应出现在 notebook 根级直属列表里。

---

### T04 - 文档路径语义：`get_path`

#### 目标

验证文档 ID 到存储路径的转换正确。

#### 步骤

调用：

```json
{
  "action": "get_path",
  "id": "<sourceDocId>"
}
```

#### 预期

返回对象至少包含：

- `notebook = testNotebookId`
- `path` 形如：
  - `/xxxxxxxxxxxxxx-xxxxxxx.sy`

记录该路径为：

- `sourceStoragePath`

---

### T05 - 文档路径语义：`get_hpath`

#### 目标

验证文档 ID / 存储路径到层级路径的转换正确。

#### 步骤

1. 通过 ID 查询：

```json
{
  "action": "get_hpath",
  "id": "<sourceDocId>"
}
```

2. 通过 `notebook + path` 查询：

```json
{
  "action": "get_hpath",
  "notebook": "<testNotebookId>",
  "path": "<sourceStoragePath>"
}
```

#### 预期

两次返回都应为：

- `/SourceDoc`

---

### T06 - 文档路径语义：`get_ids`

#### 目标

验证层级路径到文档 ID 的逆向转换。

#### 步骤

调用：

```json
{
  "action": "get_ids",
  "notebook": "<testNotebookId>",
  "path": "/SourceDoc"
}
```

#### 预期

返回数组：

- 必须包含 `sourceDocId`
- 理想情况下仅包含 `sourceDocId`

---

### T07 - 文档重命名：路径形态

#### 目标

验证 `rename(notebook + path + title)` 正常。

#### 步骤

调用：

```json
{
  "action": "rename",
  "notebook": "<testNotebookId>",
  "path": "<sourceStoragePath>",
  "title": "SourceDoc Path Renamed"
}
```

随后再次调用：

```json
{
  "action": "get_hpath",
  "id": "<sourceDocId>"
}
```

#### 预期

- 重命名成功
- `get_hpath` 返回：
  - `/SourceDoc Path Renamed`

---

### T08 - 文档重命名：ID 形态

#### 目标

验证 `rename(id + title)` 正常。

#### 步骤

调用：

```json
{
  "action": "rename",
  "id": "<sourceDocId>",
  "title": "SourceDoc ID Renamed"
}
```

随后再次检查：

```json
{
  "action": "get_hpath",
  "id": "<sourceDocId>"
}
```

#### 预期

- 重命名成功
- 最终层级路径为：
  - `/SourceDoc ID Renamed`

---

### T09 - document 子文档查询

#### 目标

验证 `document(action="get_child_docs")` 只返回直属子文档。

#### 步骤

调用：

```json
{
  "action": "get_child_docs",
  "id": "<targetDocId>"
}
```

#### 预期

返回数组，并满足：

- 包含 `childDocId`
- 不应包含 `sourceDocId`
- 不应包含其它根级文档

---

### T10 - block 基础写入

#### 目标

在 `SourceDoc` 中构建可验证的块顺序。

#### 步骤

依次执行：

1. 在文档末尾追加：

```json
{
  "action": "append",
  "dataType": "markdown",
  "data": "- doc append",
  "parentID": "<sourceDocId>"
}
```

2. 在文档开头插入：

```json
{
  "action": "prepend",
  "dataType": "markdown",
  "data": "- doc prepend",
  "parentID": "<sourceDocId>"
}
```

3. 在 `append` 生成的块前插入：

```json
{
  "action": "insert",
  "dataType": "markdown",
  "data": "- insert before append",
  "nextID": "<appendBlockId>"
}
```

保存：

- `appendBlockId`
- `prependBlockId`
- `insertBlockId`

#### 预期

三个操作都成功返回块变更结果。

---

### T11 - block 子块顺序查询

#### 目标

验证 `block.get_children(docId)` 顺序正确。

#### 步骤

调用：

```json
{
  "action": "get_children",
  "id": "<sourceDocId>"
}
```

#### 预期

返回块数组，按内容顺序应至少满足：

1. `- doc prepend`
2. `# Source`
3. `seed`
4. `- insert before append`
5. `- doc append`

---

### T12 - document 子块查询

#### 目标

验证 `document(action="get_child_blocks")` 与 `block.get_children(docId)` 一致。

#### 步骤

调用：

```json
{
  "action": "get_child_blocks",
  "id": "<sourceDocId>"
}
```

并与 T11 的结果对比。

#### 预期

- 两者返回的直属子块列表一致
- 顺序一致

---

### T13 - block 更新与属性

#### 目标

验证块更新与属性接口可用。

#### 步骤

1. 更新 `appendBlockId`：

```json
{
  "action": "update",
  "dataType": "markdown",
  "data": "- doc append updated",
  "id": "<appendBlockId>"
}
```

2. 设置属性：

```json
{
  "action": "set_attrs",
  "id": "<appendBlockId>",
  "attrs": {
    "custom-ai-test": "ok"
  }
}
```

3. 读取属性：

```json
{
  "action": "get_attrs",
  "id": "<appendBlockId>"
}
```

#### 预期

- 更新成功
- `get_attrs` 返回中包含：
  - `"custom-ai-test": "ok"`

---

### T14 - block 折叠与展开

#### 目标

验证 `fold` / `unfold` 可执行。

#### 步骤

对 `appendBlockId` 调用：

```json
{
  "action": "fold",
  "id": "<appendBlockId>"
}
```

然后：

```json
{
  "action": "unfold",
  "id": "<appendBlockId>"
}
```

#### 预期

两个调用都返回成功。

---

### T15 - block 移动

#### 目标

验证块移动后顺序变化正确。

#### 步骤

调用：

```json
{
  "action": "move",
  "id": "<insertBlockId>",
  "previousID": "<appendBlockId>",
  "parentID": "<sourceDocId>"
}
```

然后再次调用：

```json
{
  "action": "get_children",
  "id": "<sourceDocId>"
}
```

#### 预期

最终顺序中：

- `- doc append updated`
- `- insert before append`

两者相邻，且 `insert before append` 在后面。

---

### T16 - kramdown 导出

#### 目标

验证 `block(action="get_kramdown")` 能读出更新后的内容。

#### 步骤

调用：

```json
{
  "action": "get_kramdown",
  "id": "<sourceDocId>"
}
```

#### 预期

返回结果中应包含：

- `doc append updated`

---

### T17 - file 基础接口

#### 目标

验证基础 file 接口正常。

#### 步骤

1. `file(action="get_version")`
2. `file(action="get_current_time")`
3. `file(action="render_sprig", template="codex-{{ now | date \"2006\" }}")`
4. `file(action="export_md", id=sourceDocId)`

#### 预期

1. `get_version` 返回 `version`
2. `get_current_time` 返回数字型时间
3. `render_sprig` 返回类似 `codex-2026`
4. `export_md` 返回内容中包含：
   - `/SourceDoc ID Renamed`
   - `doc append updated`

---

### T18 - 文档移动：ID 形态

#### 目标

验证 `document.move(fromIDs + toID)` 正常。

#### 步骤

调用：

```json
{
  "action": "move",
  "fromIDs": ["<deleteDocId>"],
  "toID": "<targetDocId>"
}
```

#### 预期

返回成功。

随后可再次用：

```json
{
  "action": "get_path",
  "id": "<deleteDocId>"
}
```

确认其路径已进入 `TargetDoc` 目录下。

---

### T19 - 文档移动：路径形态

#### 目标

验证 `document.move(fromPaths + toNotebook + toPath)` 正常。

#### 步骤

1. 获取 `pathMoveDocId` 的存储路径，记为 `pathMoveStoragePath`
2. 获取 `targetDocId` 的存储路径，记为 `targetStoragePath`
3. 调用：

```json
{
  "action": "move",
  "fromPaths": ["<pathMoveStoragePath>"],
  "toNotebook": "<testNotebookId>",
  "toPath": "<targetStoragePath>"
}
```

4. 再次调用：

```json
{
  "action": "get_path",
  "id": "<pathMoveDocId>"
}
```

#### 预期

- 移动成功
- 新路径应位于 `TargetDoc` 下面

---

## 7. 权限回归测试

这一部分是本次改动的重点，必须执行。

---

### T20 - readonly 权限下禁止写

#### 目标

验证测试笔记本设为 `readonly` 后，写操作会被拦截。

#### 步骤

先设置：

```json
{
  "action": "set_permission",
  "notebook": "<testNotebookId>",
  "permission": "readonly"
}
```

随后分别尝试以下写操作（都只针对测试对象）：

1. `document.create`
2. `document.rename(id=sourceDocId, ...)`
3. `document.remove(id=deleteDocId)`
4. `document.move(fromIDs=[pathMoveDocId], toID=targetDocId)`
5. `block.append(parentID=sourceDocId, ...)`
6. `block.update(id=appendBlockId, ...)`
7. `block.delete(id=appendBlockId)`
8. `block.move(id=insertBlockId, ...)`
9. `block.fold(id=appendBlockId)`
10. `block.unfold(id=appendBlockId)`

#### 预期

这些操作都应失败，并返回结构：

```json
{
  "error": {
    "type": "permission_denied",
    "notebook": "<testNotebookId>",
    "current_permission": "readonly",
    "required_permission": "write"
  }
}
```

允许 `message` 文本有细微差异，但以下字段必须符合：

- `type = permission_denied`
- `current_permission = readonly`
- `required_permission = write`

---

### T21 - readonly 权限下允许读

#### 目标

验证 `readonly` 不会错误拦截读操作。

#### 步骤

在 `readonly` 状态下尝试以下操作：

1. `notebook.get_conf`
2. `notebook.get_child_docs`
3. `document.get_path(id=sourceDocId)`
4. `document.get_hpath(id=sourceDocId)`
5. `document.get_child_docs(id=targetDocId)`
6. `document.get_child_blocks(id=sourceDocId)`
7. `block.get_children(id=sourceDocId)`
8. `block.get_kramdown(id=sourceDocId)`
9. `block.get_attrs(id=appendBlockId)`

#### 预期

以上调用都应成功。

---

### T22 - none 权限下禁止读写

#### 目标

验证测试笔记本设为 `none` 后，读写操作都会被拦截。

#### 步骤

先设置：

```json
{
  "action": "set_permission",
  "notebook": "<testNotebookId>",
  "permission": "none"
}
```

随后尝试以下读操作：

1. `notebook.get_conf`
2. `notebook.get_child_docs`
3. `document.get_path(id=sourceDocId)`
4. `document.get_hpath(id=sourceDocId)`
5. `document.get_child_docs(id=targetDocId)`
6. `document.get_child_blocks(id=sourceDocId)`
7. `block.get_children(id=sourceDocId)`
8. `block.get_kramdown(id=sourceDocId)`
9. `block.get_attrs(id=appendBlockId)`

然后继续尝试以下写操作（都只针对测试对象）：

10. `document.create`
11. `document.rename(id=sourceDocId, ...)`
12. `document.remove(id=deleteDocId)`
13. `document.move(fromIDs=[pathMoveDocId], toID=targetDocId)`
14. `block.append(parentID=sourceDocId, ...)`
15. `block.update(id=appendBlockId, ...)`
16. `block.delete(id=appendBlockId)`

#### 预期

上述读操作都应失败，并返回：

```json
{
  "error": {
    "type": "permission_denied",
    "notebook": "<testNotebookId>",
    "current_permission": "none",
    "required_permission": "read"
  }
}
```

上述写操作也都应失败，并且返回同样的 `permission_denied`，只是：

- `current_permission = none`
- `required_permission = write`

---

### T23 - 恢复权限

#### 目标

恢复环境，并验证 `write`（full access）下读写能力都恢复正常。

#### 步骤

调用：

```json
{
  "action": "set_permission",
  "notebook": "<testNotebookId>",
  "permission": "write"
}
```

随后至少执行一组读操作和一组写操作验证恢复成功，例如：

读操作示例：

```json
{
  "action": "get_path",
  "id": "<sourceDocId>"
}
```

```json
{
  "action": "get_children",
  "id": "<sourceDocId>"
}
```

写操作示例：

```json
{
  "action": "append",
  "dataType": "markdown",
  "data": "- permission restored",
  "parentID": "<sourceDocId>"
}
```

#### 预期

- 设置成功
- 读操作成功，返回正常数据
- 追加成功
- 如继续执行 `document.create` / `document.rename` / `block.update` / `block.delete`，也应恢复成功

---

## 8. 清理步骤

AI 必须清理自己创建的数据。

### 建议清理顺序

1. 如果权限不是 `write`，先恢复为 `write`
2. 删除测试过程中新增的块（如有必要）
3. 删除测试文档
4. 删除测试笔记本

### 最低要求

至少确保：

- 测试笔记本被删除
- 没有遗留测试文档

---

## 9. 最终报告模板

AI 完成测试后，必须输出如下结构的报告。

### 9.1 总结

- 测试时间
- 测试目标
- 总体结果：`PASS` / `FAIL` / `PARTIAL`

### 9.2 环境信息

- SiYuan 版本
- 可见工具列表
- 是否看到了：
  - `notebook.get_child_docs`
  - `document.get_child_blocks`
  - `document.get_child_docs`

### 9.3 用例结果

按如下格式逐条列出：

- `T01 PASS` - 原因
- `T02 PASS` - 原因
- `T03 FAIL` - 实际返回 xxx，预期 yyy

### 9.4 关键结论

必须明确回答以下问题：

1. `notebook.get_child_docs` 是否只返回直属子文档？
2. `document.get_child_docs` 是否只返回直属子文档？
3. `document.get_child_blocks` 是否与 `block.get_children(docId)` 一致？
4. `readonly` 下写操作是否被拦截？
5. `none` 下读操作是否被拦截？
6. `none` 下写操作是否被拦截？
7. `write` 下读操作是否恢复正常？
8. `write` 下写操作是否恢复正常？
9. `document.get_path` 是否已受读权限保护？
10. `block` 工具是否已不再通过“把块 ID 当文档 ID”导致权限漏检？

### 9.5 遗留问题

如果有异常，必须列出：

- 失败步骤
- 调用参数
- 实际返回
- 推测原因

---

## 10. 建议给 AI 的执行提示词

可以直接把下面这段提示词连同本文件一起交给 AI：

> 请严格按照 `AI_INTERFACE_TEST.md` 执行 SiYuan MCP 接口测试。  
> 只允许操作你自己创建的测试笔记本和测试文档。  
> 每一步都要记录调用参数、返回结果、预期结果和 PASS/FAIL。  
> 如果某一步失败，保留现场并继续执行后续安全步骤。  
> 测试结束后必须恢复权限并清理测试数据，最后按文档中的“最终报告模板”输出完整报告。
