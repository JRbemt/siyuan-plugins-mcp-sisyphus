# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

> Recommended pairing: use this plugin together with [AI CLI Bridge for SiYuan](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge) to embed OpenCode, Claude Code, and other AI CLI tools directly in the SiYuan sidebar.

A SiYuan Note MCP server plugin built around progressive disclosure — exposing eight aggregated tools: `notebook`, `document`, `block`, `file`, `search`, `tag`, `system`, and `mascot`. Paired with a four-state permission model (`none` / `r` / `rw` / `rwd`), mandatory confirmation gates on high-risk actions, steadily refined tool behavior, and a lightweight mascot feedback loop, it streamlines AI integration while keeping your note data safe — making automation more reliable and access control more precise.

- `notebook`
- `document`
- `block`
- `file`
- `search`
- `tag`
- `system`
- `mascot`

Each tool uses a required `action` field instead of exposing dozens of endpoint-shaped tool names.

## Design: Progressive Disclosure

The MCP tool layer is built around **progressive disclosure** — revealing complexity only when needed, rather than flooding the AI with everything upfront.

### Three layers

**① Tool description (what LLMs see first)**

Each tool's description leads with high-frequency **common actions** and their required fields. Low-frequency or high-risk **advanced actions** are listed by name only, with a pointer to on-demand documentation:

```
Common actions: list, create, rename, get_doc ...  (required fields shown)
Additional actions: remove, move, list_tree ...     → read siyuan://help/action/{tool}/{action}
```

This way `listTools()` returns concise, actionable information instead of a wall of 87 actions.

**② Help layer (on demand)**

- Per-action detail — parameters, semantics, caveats — lives in the `siyuan://help/action/{tool}/{action}` resource, fetched only when needed
- Call any tool with `action: "help"` to get a structured breakdown of all its actions, tiers, and hints inline (fallback for clients without resource support)

**③ Response layer (large results auto-summarise)**

Big result sets are capped and annotated with drill-down hints rather than returned in full:

| Scenario | Behaviour |
|----------|-----------|
| `search.fulltext` > 20 blocks | Truncated + `page`/`pageSize` pagination hint |
| `search.query_sql` > 50 rows | Truncated + `LIMIT`/`OFFSET` hint |
| `block.get_children` > 50 children | Truncated + `query_sql` filter hint |
| `document.list_tree` deep nodes | Collapsed to `childCount` beyond `maxDepth` (default 3) |
| `document.get_doc` > 8 000 chars | Truncated + `get_child_blocks` block-by-block hint |

**Design goals:** reduce first-call cognitive load; preserve full capability (all advanced actions remain usable); maintain backward compatibility with existing configs and tool names.

## Features

- Full SiYuan API coverage for notebooks, documents, blocks, assets, export, and notifications
- A smaller MCP surface: 8 grouped tools instead of dozens of endpoint-level tools
- Clearer parameter semantics, result shapes, and help messages for smoother MCP client integration
- Action-level toggles in the plugin settings. In the default fallback config, delete-style actions are disabled while move actions stay enabled and confirmation-gated.
- Notebook- and document-level tree queries for direct child documents and blocks
- Full-text search, SQL queries, tag search, backlink and backmention queries
- A mascot tool plus on-screen mascot feedback for balance, shop, buy, and lightweight MCP activity visibility
- Notebook permission guards now resolve block/document ownership before mutating APIs run, with more predictable edge-case handling

## Permission Model

- `rwd`: full read/write/delete access
- `rw`: read/write access, but delete actions are rejected
- `r`: read access only; all write and delete actions are rejected
- `none`: no read, write, or delete access
- `notebook(action="set_permission")` takes effect immediately for later `notebook`, `document`, and `block` calls
- For AI regression runs, preheat all 8 tools early so permission prompts do not interrupt the middle of a test

## Timeline

- `v0.1.14`: Adds an `ai-layout-guide` help resource, teaches better SiYuan layout semantics for notes, tags, bookmarks, and flashcards, and refreshes smoke coverage for the 8-tool surface
- `v0.1.13`: Requires standard token-authenticated SiYuan requests, trims trailing slashes from `SIYUAN_API_URL`, and fixes empty-response JSON parse failures
- `v0.1.12`: Adds the `mascot` aggregated tool, improves Docker/env-based API auth flows, and refreshes docs plus tests for the 8-tool surface
- `v0.1.11`: Adds document cover actions, switches asset uploads to local-path flows with large-file confirmation, and refreshes docs plus tests
- `v0.1.10`: Refines aggregated tool behavior, tightens permission/path/help details, and refreshes docs plus test coverage
- `v0.1.9`: Expands notebook permissions to `none` / `r` / `rw` / `rwd`, improves move/export behaviors, and strengthens MCP docs and test coverage
- `v0.1.8`: Adds notebook and document icon support and updates the aggregated MCP tool surface back to 7 tools
- `v0.1.6`: Adds the `search` aggregated tool with full-text search, SQL queries, tag search, backlinks, and backmentions
- `v0.1.5`: Shrinks MCP exposure to 4 aggregated tools and adds notebook-level permission guards with high-risk action confirmations
- `v0.1.4`: Auto-generates the MCP config file on first install, so clients can connect out of the box
- `v0.1.3`: Removes unrelated config noise and keeps the plugin focused on MCP capabilities
- `v0.1.2`: Merges MCP tool config into one entry and adds dual-path fallback for more reliable loading

See full history in [CHANGELOG.md](./CHANGELOG.md).

## High-Risk Actions

The server instructions require explicit user confirmation before these actions are called:

- `notebook(action="remove")`
- `notebook(action="set_permission")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`
- `file(action="upload_asset")`
- `tag(action="remove")`

If your client shows MCP instructions, the model should ask for confirmation before executing them. This is an instruction-layer safety rule, not a server-side modal dialog guarantee.

In the default fallback config, `document(action="move")` and `block(action="move")` are still exposed. They are not safe to call without confirmation just because they are enabled.

Also note:
- `file(action="upload_asset")` on files larger than the configured threshold (`10 MB` by default) must stop the current operation and ask the user before retrying with `confirmLargeFile=true`.

- `document(action="move", fromPaths + toNotebook + toPath)` expects `toPath` to be the storage path of an existing destination document.
- `block(action="move")` returns a structured success object from MCP, even though the underlying SiYuan API may return `null`.

## Installation

### From SiYuan Marketplace

1. Open SiYuan Note
2. Go to Settings > Marketplace
3. Search for `SiYuan MCP`
4. Install and enable the plugin

### From Source

```bash
git clone https://github.com/your-repo/siyuan-plugins-mcp-sisyphus.git
pnpm install
pnpm run build
pnpm run make-link
```

## MCP Client Configuration

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["{SIYUAN_PATH}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs"]
      "env":{
        "SIYUAN_API_URL": "http://127.0.0.1:6806",
        "SIYUAN_TOKEN": "xxxxxx"
      }
    }
  }
}
```
`SIYUAN_TOKEN` is optional when your SiYuan instance does not require API authentication. If API authentication is enabled in SiYuan, you must provide `SIYUAN_TOKEN`. Get the API token from `Settings -> About`.

The folder name in the path must match `plugin.json`: `siyuan-plugins-mcp-sisyphus`.

OpenClaw / mcporter users can follow [SKILL.md](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/skills/siyuan-mcp-sisyphus/SKILL.md).

Detailed API ↔ MCP mapping: [API_MCP_MAPPING.md](./API_MCP_MAPPING.md)

## Tool Model

### `notebook`

| Action | Description |
|--------|-------------|
| `list` | List all notebooks |
| `create` | Create a new notebook (supports `icon`, prefer Unicode hex strings like `1f4d4`) |
| `open` / `close` | Open or close a notebook |
| `rename` | Rename a notebook |
| `get_conf` / `set_conf` | Get or set notebook configuration |
| `set_icon` | Set notebook icon; prefer Unicode hex strings like `1f4d4` over raw emoji characters |
| `get_permissions` | List all notebook permission levels |
| `set_permission` | Change notebook MCP permission (`none` / `r` / `rw` / `rwd`) |
| `get_child_docs` | Get direct child documents at notebook root with clearer notebook-state errors |

### `document`

| Action | Description |
|--------|-------------|
| `create` | Create a document with markdown (supports `icon`, prefer Unicode hex strings like `1f4d4`) |
| `rename` | Rename a document by ID or storage path |
| `remove` | Remove a document by ID or storage path |
| `move` | Move documents by ID or storage path |
| `set_icon` | Set document or folder icon; prefer Unicode hex strings like `1f4d4` over raw emoji characters |
| `set_cover` | Set the document cover image, preferably from an `http(s)` URL and secondarily from a `/assets/...` path |
| `clear_cover` | Clear the document cover image |
| `get_path` | Get storage path by document ID |
| `get_hpath` | Get human-readable path by ID or storage path |
| `get_ids` | Get document IDs by human-readable path |
| `get_child_blocks` | Get direct child blocks of a document |
| `get_child_docs` | Get direct child documents of a document |
| `list_tree` | List the nested document tree under a notebook path |
| `search_docs` | Search documents by title keyword, then optionally narrow by storage path |
| `get_doc` | Get document content and metadata by ID (`markdown` returns clean Markdown; `html` returns the focus-view HTML payload) |
| `create_daily_note` | Create or return today’s daily note for a notebook |

Path semantics: `create` and `get_ids` use human-readable paths (e.g., `/Inbox/Weekly Note`). `rename`, `remove`, `move`, `get_hpath`, `list_tree`, and `search_docs.path` use storage paths returned by `get_path`. Use `get_ids` when you need to resolve a human-readable path to a document ID. Right after `create`, `get_ids` may briefly lag because it depends on SiYuan indexing.

Cover semantics: `set_cover` and `clear_cover` are semantic wrappers around the document root block's `title-img` attribute. Prefer passing a direct image URL to `set_cover`; only upload into `/assets/...` first when the user explicitly wants the image stored in SiYuan. To inspect the raw stored value, use `block(action="get_attrs", id=docId)`.

### `block`

| Action | Description |
|--------|-------------|
| `insert` / `prepend` / `append` | Insert a block at position, start, or end and return a slim success payload |
| `update` | Update block content and return a slim success payload |
| `delete` | Delete a block |
| `move` | Move a block to a new position |
| `fold` / `unfold` | Fold or unfold a foldable block |
| `get_kramdown` | Get block content in kramdown format |
| `get_children` | Get direct child blocks |
| `transfer_ref` | Transfer block references |
| `set_attrs` / `get_attrs` | Set or get block attributes, including custom metadata such as `custom-riff-decks` for flashcards |
| `exists` | Check whether a block exists |
| `info` | Get root document metadata for a block |
| `breadcrumb` | Get breadcrumb path for a block |
| `dom` | Get rendered DOM for a block |
| `recent_updated` | List recently updated blocks, filtered by notebook permission and optional `count` |
| `word_count` | Get word-count statistics for blocks |

### `file`

| Action | Description |
|--------|-------------|
| `upload_asset` | Read a local file path and upload that file asset (requires confirmation; files larger than the configured threshold, `10 MB` by default, must stop and ask the user before retrying with `confirmLargeFile=true`) |
| `render_template` | Render a template with document context |
| `render_sprig` | Render a Sprig template |
| `export_md` | Export document as Markdown |
| `export_resources` | Export resources as ZIP, accepting `assets/...`, normalizing to `data/assets/...`, and optionally copying to local `outputPath` (requires confirmation when writing locally) |

### `system`

| Action | Description |
|--------|-------------|
| `push_msg` / `push_err_msg` | Push notification or error message |
| `get_version` / `get_current_time` | Get SiYuan version or current time (`get_current_time` also returns ISO text) |
| `workspace_info` | Get SiYuan workspace metadata. High risk: exposes the absolute workspace path; disabled by default |
| `network` | Get masked network proxy information |
| `changelog` | Get the current version changelog when available |
| `conf` | Get masked system configuration with summary-first progressive reading |
| `sys_fonts` | List available system fonts with summary-first paginated reading |
| `boot_progress` | Get current boot progress details |

### `mascot`

| Action | Description |
|--------|-------------|
| `get_balance` | Get the mascot's current spendable balance |
| `shop` | List the mascot shop inventory with stable item IDs, labels, cost, type, and emoji |
| `buy` | Buy one mascot shop item by `item_id` and spend from the current balance |

Tags are not created through a dedicated tag action. Write tags into block markdown as `#tag#` so SiYuan can recognize them.

Flashcards are marked through block attributes rather than a dedicated action. Use `block(action="set_attrs", id=..., attrs={"custom-riff-decks":"<deck-id>"})` on the question block. A common pattern is to use an `h2` heading as the question and keep the following blocks as the answer.

### `search`

| Action | Description |
|--------|-------------|
| `fulltext` | Full-text search across blocks, with optional `stripHtml=true` to add plain-text fields |
| `query_sql` | Execute read-only SQL (SELECT / WITH only) and return permission-filtered `rows` plus metadata |
| `search_tag` | Search tags by keyword |
| `get_backlinks` | Find documents/blocks that reference a block, with partial-result metadata when filtered |
| `get_backmentions` | Find documents/blocks that mention a block name, with partial-result metadata when filtered |

### `tag`

| Action | Description |
|--------|-------------|
| `list` | List workspace tags |
| `rename` | Rename a tag label |
| `remove` | Remove a tag label |


## Tool Toggles

In SiYuan, open `Settings -> Plugins -> SiYuan MCP sisyphus`.

- Each aggregated tool has a top-level enable switch
- Each action can still be enabled or disabled individually
- The default fallback config exposes move actions but not delete-style actions
- Existing old-style configs are migrated automatically into the new format

## Development

Live smoke test against a local SiYuan instance:

```bash
pnpm run build
node scripts/live_mcp_smoke.cjs
```

```text
siyuan-plugins-mcp-sisyphus/
├── src/
│   ├── api/           # SiYuan API wrappers
│   ├── mcp/           # MCP server implementation
│   │   ├── tools/     # Aggregated tool handlers
│   │   ├── config.ts  # Tool config and migration helpers
│   │   ├── server.ts  # Main server
│   │   └── types.ts   # Action-level validation
│   └── index.ts       # Plugin entry point
├── public/i18n/       # Internationalization
└── package.json
```

## License

MIT
