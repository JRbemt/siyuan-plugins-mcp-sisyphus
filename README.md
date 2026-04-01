# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

MCP server for SiYuan Note. It exposes 4 aggregated tools through the Model Context Protocol:

- `notebook`
- `document`
- `block`
- `file`

Each tool uses a required `action` field instead of exposing dozens of endpoint-shaped tool names.

## Features

- Full SiYuan API coverage for notebooks, documents, blocks, assets, export, and notifications
- A smaller MCP surface: 4 tools instead of 41 endpoint-level tools
- Action-level toggles in the plugin settings. In the default fallback config, delete-style actions are disabled while move actions stay enabled and confirmation-gated.
- Notebook- and document-level tree queries for direct child documents and blocks
- Notebook permission guards now resolve block/document ownership before mutating APIs run

## Permission Model

- `write`: full read/write access
- `readonly`: read access only; all document and block writes are rejected
- `none`: no read or write access
- `notebook(action="set_permission")` takes effect immediately for later `notebook`, `document`, and `block` calls
- For AI regression runs, preheat all 4 tools early so permission prompts do not interrupt the middle of a test

## Timeline

- `v0.1.5`: Shrinks MCP exposure to 4 aggregated tools and adds notebook-level permission guards with high-risk action confirmations
- `v0.1.4`: Auto-generates the MCP config file on first install, so clients can connect out of the box
- `v0.1.3`: Removes unrelated config noise and keeps the plugin focused on MCP capabilities
- `v0.1.2`: Merges MCP tool config into one entry and adds dual-path fallback for more reliable loading

## High-Risk Actions

The server instructions require explicit user confirmation before these actions are called:

- `notebook(action="remove")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`

If your client shows MCP instructions, the model should ask for confirmation before executing them.

In the default fallback config, `document(action="move")` and `block(action="move")` are still exposed. They are not safe to call without confirmation just because they are enabled.

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
      "args": ["/absolute/path/SiYuan/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs"]
    }
  }
}
```

The folder name in the path must match `plugin.json`: `siyuan-plugins-mcp-sisyphus`.

OpenClaw / mcporter users can follow [SKILL.md](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/skills/siyuan-mcp-sisyphus/SKILL.md).

## Tool Model

### `notebook`

Actions:

- `list`
- `create`
- `open`
- `close`
- `remove`
- `rename`
- `get_conf`
- `set_conf`
- `get_permissions`
- `set_permission`
- `get_child_docs`

Example:

```json
{
  "name": "notebook",
  "arguments": {
    "action": "rename",
    "notebook": "20210808180117-czj9bvb",
    "name": "Research"
  }
}
```

### `document`

Actions:

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`

Path semantics:

- `create.path` is a human-readable target path such as `/Inbox/Weekly Note`
- `rename`, `remove`, `move`, and `get_hpath` use storage paths when you choose the `notebook + path` shape
- `get_path` converts `id -> storage path`
- `get_hpath` and `get_ids` convert between storage paths and human-readable hierarchical paths
- `get_child_blocks` returns direct child blocks for a document ID
- `get_child_docs` returns direct child documents for a document ID

`create` does not create missing parent paths for you. Prefer creating at notebook root or under an already existing parent path.

`rename`, `remove`, `move`, and `get_hpath` support more than one argument shape. For example, `rename` can use either `id + title` or `notebook + path + title`.

Example:

```json
{
  "name": "document",
  "arguments": {
    "action": "rename",
    "id": "20240318112233-abc123",
    "title": "Weekly Notes"
  }
}
```

Direct child documents at notebook root:

```json
{
  "name": "notebook",
  "arguments": {
    "action": "get_child_docs",
    "notebook": "20210808180117-czj9bvb"
  }
}
```

### `block`

Actions:

- `insert`
- `prepend`
- `append`
- `update`
- `delete`
- `move`
- `fold`
- `unfold`
- `get_kramdown`
- `get_children`
- `transfer_ref`
- `set_attrs`
- `get_attrs`

`prepend` with a document ID inserts at the start of the document. `append` with a document ID inserts at the end of the document. With a block ID, both operate on that block's child list.

`fold` and `unfold` should be used with foldable block IDs.

Example:

```json
{
  "name": "block",
  "arguments": {
    "action": "append",
    "dataType": "markdown",
    "data": "- New item",
    "parentID": "20240318112233-abc123"
  }
}
```

### `file`

Actions:

- `upload_asset`
- `render_template`
- `render_sprig`
- `export_md`
- `export_resources`
- `push_msg`
- `push_err_msg`
- `get_version`
- `get_current_time`

Example:

```json
{
  "name": "file",
  "arguments": {
    "action": "get_version"
  }
}
```

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
