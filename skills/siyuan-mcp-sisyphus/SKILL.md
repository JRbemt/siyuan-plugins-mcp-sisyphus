---
name: siyuan-mcp-sisyphus
description: Operate SiYuan notes via 7 aggregated MCP tools (notebook/document/block/file/search/tag/system). Covers path semantics, permissions, block editing, search, tags, and export.
---

# SiYuan MCP Sisyphus

7 aggregated MCP tools for SiYuan note operations. Each tool takes an `action` parameter. Full parameter schemas are in the tool descriptions — this skill covers pitfalls and non-obvious behavior.

## Recommended Workflow

1. **Explore**: `notebook(action="list")`, `system(action="get_version")`
2. **Locate**: `document(action="get_path" | "get_hpath" | "get_ids")`
3. **Write**: `document(action="create" | "rename" | "move")`, `block(action="append" | "update" | ...)`
4. **Verify**: `document(action="get_child_blocks")` or `block(action="get_children")`

## Path Semantics (Critical)

There are exactly **two** path types. Do not mix them.

| Type | Used by | Example |
|------|---------|---------|
| **Human-readable** | `document.create`, `document.get_ids` | `/Inbox/Weekly Note` |
| **Storage path** | `document.rename`, `document.remove`, `document.move`, `document.get_hpath` (with notebook+path) | `/20240318112233-abc123.sy` |

**Safe workflow**: call `document(action="get_path", id=...)` first, then reuse the returned storage path for path-based actions.

## Disabled-by-Default Actions

These actions are disabled in the default plugin configuration. Calling them returns `{error: {type: "action_disabled"}}`. They must be enabled in SiYuan plugin settings first.

| Tool | Action |
|------|--------|
| notebook | `remove` |
| notebook | `set_permission` |
| document | `remove` |
| block | `delete` |

Warn the user before attempting these — they may need to enable them manually.

## Permission System

Four levels per notebook: `rwd` (read/write/delete), `rw` (read/write, no delete), `r` (read only), `none` (all blocked).

Check with `notebook(action="get_permissions")`. Change with `notebook(action="set_permission")`.

On denial, the error includes actionable context:
```json
{
  "error": {
    "type": "permission_denied",
    "notebook": "20260401...",
    "current_permission": "r",
    "required_permission": "delete"
  }
}
```

## Dangerous Actions (Require User Confirmation)

Before calling any of these, describe the action and wait for explicit user agreement:

- `notebook(action="remove")` — if enabled
- `document(action="remove")` — if enabled
- `document(action="move")`
- `block(action="delete")` — if enabled
- `block(action="move")`

## Action Reference

### `notebook`

| Action | Type | Notes |
|--------|------|-------|
| `list` | read | Returns all notebooks with id, name, sort info |
| `create` | write | Requires `name` |
| `open` / `close` | read | Open/close a notebook by ID |
| `rename` | write | Requires `notebook` + `name` |
| `get_conf` / `set_conf` | read/write | `set_conf` takes a `conf` object (name, closed, dailyNoteSavePath, etc.) |
| `get_permissions` | read | Returns all notebooks with their permission level |
| `set_permission` | write | **Disabled by default.** Set `none` / `r` / `rw` / `rwd` |
| `get_child_docs` | read | Direct children at notebook root. `.name` field has `.sy` suffix (filename, not title) |

### `document`

| Action | Type | Notes |
|--------|------|-------|
| `create` | write | `notebook` + `path` (human-readable) + `markdown`. Parent paths must already exist |
| `rename` | write | Either `id` + `title` OR `notebook` + `path` (storage) + `title` |
| `remove` | write | **Disabled by default.** Either `id` OR `notebook` + `path` (storage) |
| `move` | write | Either `fromIDs` + `toID` OR `fromPaths` + `toNotebook` + `toPath` (storage). For path-based moves, `toPath` must be an existing destination document |
| `get_path` | read | Returns `{notebook, path}` — the storage path for an ID |
| `get_hpath` | read | Returns human-readable hierarchy path. Either `id` OR `notebook` + `path` (storage) |
| `get_ids` | read | `notebook` + `path` (human-readable). Returns array of document IDs |
| `get_child_blocks` | read | Direct child blocks of a document. Same result as `block.get_children` with a doc ID |
| `get_child_docs` | read | Direct child documents. `.name` has `.sy` suffix |

### `block`

| Action | Type | Notes |
|--------|------|-------|
| `insert` | write | `dataType` + `data`. Position: `nextID` = insert BEFORE that block, `previousID` = insert AFTER. Provide at least one of `nextID`, `previousID`, `parentID` |
| `prepend` | write | Inserts at start. `parentID` as doc ID → document head; as block ID → that block's child list |
| `append` | write | Inserts at end. Same parentID semantics as prepend |
| `update` | write | `dataType` + `data` + `id`. Replaces block content |
| `delete` | write | **Disabled by default.** Requires `id` |
| `move` | write | `id` + at least one of `previousID` / `parentID`. MCP returns a structured success object; use `get_children` to verify placement if needed |
| `fold` / `unfold` | write | Must be a foldable block ID, NOT a document ID |
| `get_kramdown` | read | Returns block content in kramdown format with IAL attributes |
| `get_children` | read | Works with both document IDs AND block IDs. Returns direct children |
| `transfer_ref` | write | `fromID` + `toID`. `refIDs` is optional |
| `set_attrs` / `get_attrs` | write/read | Block custom attributes, including `custom-riff-decks` for flashcards |

### `file`

| Action | Type | Notes |
|--------|------|-------|
| `render_sprig` | read | Sprig/Go template rendering. Example: `{{now \| date "2006-01-02"}}` |
| `render_template` | read | Render a template file with document context. Requires `id` + `path` (absolute file path) |
| `export_md` | read | Returns `{content: "---\ntitle: ...\n---\n...", hPath: "/..."}` — full markdown with frontmatter |
| `upload_asset` | write | `assetsDirPath` + `file` (base64) + `fileName` |
| `export_resources` | read | Exports paths as ZIP. Optional `name` for the archive |

### `system`

| Action | Type | Notes |
|--------|------|-------|
| `get_version` | read | Returns `{version: "3.x.x"}` |
| `get_current_time` | read | Returns `{currentTime: <epoch_ms>}` (milliseconds since epoch, not formatted) |
| `push_msg` | — | Show notification in SiYuan UI. Optional `timeout` in ms |
| `push_err_msg` | — | Show error notification. Optional `timeout` in ms |

### Tag creation

There is no direct `tag.create` action. To create a real SiYuan tag, write it into block markdown as `#标签#` with both leading and trailing `#`.

### Flashcard marking

There is no dedicated flashcard action. To mark a block as a flashcard, call `block(action="set_attrs", id=..., attrs={"custom-riff-decks":"<deck-id>"})`.

Recommended structure:

- Use an `h2` heading as the question block
- Keep the following blocks as the answer content
- Set `custom-riff-decks` on the question block, not on every answer block

## MCP Help Resources

The server exposes help resources readable via `ReadMcpResourceTool`:

- `siyuan://help/tool-overview` — all tools, enabled actions, and guidance
- `siyuan://help/document-path-semantics` — path type details with examples
- `siyuan://help/examples` — minimal call examples for common actions
- `siyuan://help/action/{tool}/{action}` — per-action help with parameter shapes

Use these for on-demand reference during a session.
