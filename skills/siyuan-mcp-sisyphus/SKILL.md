---
name: siyuan-mcp-sisyphus
description: Operate SiYuan notes via 8 aggregated MCP tools (notebook/document/block/file/search/tag/system/mascot). Covers path semantics, permissions, block editing, search, tags, export, and mascot actions.
---

# SiYuan MCP Sisyphus

8 aggregated MCP tools for SiYuan note operations. Each tool takes an `action` parameter. Full parameter schemas are in the tool descriptions; use `action="help"` on any tool for detailed guidance.

## Recommended Workflow

1. **Explore**: `notebook(action="list")`, `system(action="get_version")`
2. **Locate**: `document(action="get_path" | "get_hpath" | "get_ids")`
3. **Write**: `document(action="create" | "rename" | "move")`, `block(action="append" | "update" | ...)`
4. **Verify**: `document(action="get_child_blocks")` or `block(action="get_children")`

## Getting Help

- Call any tool with `action="help"` to get its actions, required fields, hints, and examples.
- MCP resources are also available if your client supports them:
  - `siyuan://help/tool-overview` — all tools, enabled actions, and guidance
  - `siyuan://help/document-path-semantics` — path type details with examples
  - `siyuan://help/examples` — minimal call examples for common actions
  - `siyuan://help/ai-layout-guide` — layout and block-type decision rules
  - `siyuan://help/action/{tool}/{action}` — per-action parameter shapes

## Disabled-by-Default Actions

These actions return `{error: {type: "action_disabled"}}` unless enabled in SiYuan plugin settings.

| Tool | Action |
|------|--------|
| notebook | `remove` |
| notebook | `set_permission` |
| document | `remove` |
| block | `delete` |

## Permission System

Four levels per notebook: `rwd` (read/write/delete), `rw` (read/write), `r` (read only), `none` (all blocked).

Check with `notebook(action="get_permissions")`. Change with `notebook(action="set_permission")`.

## Dangerous Actions (Require User Confirmation)

Before calling any of these, describe the action and wait for explicit user agreement:

- `notebook(action="remove")` — if enabled
- `document(action="remove")` — if enabled
- `document(action="move")`
- `block(action="delete")` — if enabled
- `block(action="move")`
- `file(action="upload_asset")` — reads local filesystem
- `file(action="export_resources", outputPath=...)` — writes to local filesystem

## Quick Reference

### Path semantics

| Type | Used by | Example |
|------|---------|---------|
| **Human-readable** | `document.create`, `document.get_ids` | `/Inbox/Weekly Note` |
| **Storage path** | `document.rename`, `document.remove`, `document.move`, `document.get_hpath` (with notebook+path) | `/20240318112233-abc123.sy` |

Safe workflow: `document(action="get_path", id=...)` first, then reuse the returned storage path.

### Tag creation

No direct `tag.create` — write `#标签#` into block markdown. Hierarchical: `#项目/阶段#`.

### Flashcard marking

`block(action="set_attrs", id=..., attrs={"custom-riff-decks":"<deck-id>"})`. Use h2 as question, following blocks as answer.
