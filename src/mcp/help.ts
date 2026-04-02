import {
    ACTIONS_BY_CATEGORY,
    type BlockAction,
    type DocumentAction,
    type FileAction,
    type NotebookAction,
    type SearchAction,
    type SystemAction,
    type TagAction,
    type ToolCategory,
} from './config';

export const NOTEBOOK_GUIDANCE: string[] = [
    'Use notebook IDs for open, close, rename, get_conf, and set_conf.',
    'notebook(action="remove") requires explicit user confirmation before execution.',
    'notebook(action="get_child_docs") returns direct child documents at the notebook root.',
];

export const DOCUMENT_GUIDANCE: string[] = [
    'document(action="create") uses a human-readable target path such as /Inbox/Weekly Note.',
    'Other document actions that use notebook + path expect storage paths returned by document(action="get_path").',
    'A safe path-based workflow is get_path -> rename/remove/move/get_hpath.',
    'document(action="get_child_blocks") and document(action="get_child_docs") return direct children for a document ID.',
    'document(action="search_docs") uses notebook only for MCP permission scoping; SiYuan title search itself is global.',
];

export const BLOCK_GUIDANCE: string[] = [
    'block(action="prepend") or block(action="append") with a document ID targets the document start or end.',
    'block(action="prepend") or block(action="append") with a block ID targets that block\'s child list.',
    'To create real SiYuan tags inside markdown content, use the syntax #标签# with both leading and trailing # characters.',
    'block(action="fold") and block(action="unfold") require a foldable block ID, not a document ID.',
    'block(action="recent_updated") is read-only and returns global recent edits.',
];

export const FILE_GUIDANCE: string[] = [
    'file(action="upload_asset") expects a base64-encoded file payload.',
    'file(action="export_resources") exports the given paths as a ZIP archive.',
];

export const TAG_GUIDANCE: string[] = [
    'Tag actions operate across the whole workspace rather than a single notebook.',
    'There is no direct create action for tags; tags are created by writing #标签# into block markdown content.',
    'tag(action="remove") requires explicit user confirmation before execution.',
];

export const SYSTEM_GUIDANCE: string[] = [
    'All system actions in this tool are read-only.',
    'system(action="workspace_info") exposes the workspace path and is high-risk; it is disabled by default.',
    'system(action="conf") returns masked configuration, not raw secrets.',
    'Use system(action="conf", mode="summary") first, then mode="get" + keyPath for gradual inspection.',
    'Use system(action="sys_fonts", mode="summary") first, then mode="list" with offset/limit/query for paginated inspection.',
];

export const NOTEBOOK_ACTION_HINTS: Partial<Record<NotebookAction, string>> = {
    remove: 'This action requires explicit user confirmation.',
    set_icon: 'Use a notebook ID + icon (e.g., "1f4d4" for 📔).',
    get_child_docs: 'Use a notebook ID. Returns direct child documents at the notebook root.',
};

export const DOCUMENT_ACTION_HINTS: Partial<Record<DocumentAction, string>> = {
    create: 'Use notebook + path + markdown, where path is human-readable.',
    rename: 'Use either id + title or notebook + path + title.',
    remove: 'Use either id or notebook + path. This action requires explicit user confirmation.',
    move: 'Use either fromIDs + toID or fromPaths + toNotebook + toPath. This action requires explicit user confirmation.',
    get_hpath: 'Use either id or notebook + path.',
    get_ids: 'Use notebook + path, where path is human-readable (same format as action="create").',
    get_child_blocks: 'Use a document ID. Returns direct child blocks only.',
    get_child_docs: 'Use a document ID. Returns direct child documents only.',
    set_icon: 'Use a document ID + icon (e.g., "1f4d4" for 📔).',
    list_tree: 'Use notebook + path, where path is a storage path such as / or /20240318112233-abc123.sy.',
    search_docs: 'Use notebook + query. Search is title-based and global in SiYuan; notebook is used for MCP permission scoping.',
    get_doc: 'Use a document ID. mode="markdown" returns surrounding content; mode="html" uses the current focus view.',
    create_daily_note: 'Use a notebook ID and optionally pass app for downstream SiYuan event routing.',
};

export const BLOCK_ACTION_HINTS: Partial<Record<BlockAction, string>> = {
    insert: 'nextID inserts BEFORE that block; previousID inserts AFTER that block. Provide at least one of nextID, previousID, or parentID. Use #标签# syntax in markdown when you want SiYuan to register a real tag.',
    prepend: 'parentID can be either a document ID or block ID; behavior differs. Use #标签# syntax in markdown when you want SiYuan to register a real tag.',
    append: 'parentID can be either a document ID or block ID; behavior differs. Use #标签# syntax in markdown when you want SiYuan to register a real tag.',
    update: 'Use dataType + data + id to replace block content. If the content should create tags, write them as #标签#.',
    delete: 'This action requires explicit user confirmation.',
    move: 'Provide id plus previousID, parentID, or both to describe the destination. This action requires explicit user confirmation.',
    fold: 'Use a foldable block ID.',
    unfold: 'Use a foldable block ID.',
    get_children: 'Accepts both document IDs and block IDs. Returns direct child blocks.',
    exists: 'Returns a boolean existence check for a block ID.',
    info: 'Returns root document positioning metadata for a block.',
    breadcrumb: 'Optional excludeTypes removes matching block types from the breadcrumb.',
    dom: 'Returns rendered DOM, useful for preview-style consumers.',
    recent_updated: 'Returns recent updates across the workspace and does not accept notebook filters.',
    word_count: 'Provide one or more block IDs to receive aggregate stat data.',
};

export const FILE_ACTION_HINTS: Partial<Record<FileAction, string>> = {
    upload_asset: 'Use assetsDirPath + file + fileName, where file is base64-encoded.',
    export_resources: 'Provide one or more existing resource paths; the result is a ZIP export.',
};

export const SEARCH_GUIDANCE: string[] = [
    'All search actions are read-only and do not modify any data.',
    'search(action="query_sql") only accepts SELECT statements; mutation queries will be rejected.',
    'The blocks table columns include: id, parent_id, root_id, box, path, hpath, name, alias, memo, tag, content, fcontent, markdown, length, type, subtype, ial, sort, created, updated.',
    'Use search(action="fulltext") for natural language searches; use search(action="query_sql") for structured queries.',
];

export const SEARCH_ACTION_HINTS: Partial<Record<SearchAction, string>> = {
    fulltext: 'Pass a query string. Supports keyword, query syntax, SQL, and regex modes via the method parameter.',
    query_sql: 'Execute a SELECT statement. Common tables: blocks, spans, assets. Always use LIMIT to control result size. Example: SELECT * FROM blocks WHERE content LIKE \'%keyword%\' LIMIT 20.',
    search_tag: 'Returns all tags matching the given keyword prefix.',
    get_backlinks: 'Returns documents/blocks that contain a reference ((ref)) to the given block ID.',
    get_backmentions: 'Returns documents/blocks that mention the name of the given block (text mention, not ref link).',
};

export const TAG_ACTION_HINTS: Partial<Record<TagAction, string>> = {
    list: 'Optional sort, ignoreMaxListHint, and app are passed through to SiYuan.',
    rename: 'Renames a workspace tag label everywhere it appears.',
    remove: 'Deletes a workspace tag label. This action requires explicit user confirmation.',
};

export const SYSTEM_ACTION_HINTS: Partial<Record<SystemAction, string>> = {
    workspace_info: 'Returns workspace path metadata and current SiYuan version. High-risk: leaks the absolute workspace path; disabled by default and requires explicit user confirmation.',
    network: 'Returns masked proxy information only.',
    changelog: 'Returns show/html fields for the current version changelog when available.',
    conf: 'Defaults to a navigable summary. Use mode="get" with keyPath to read one config field or subtree at a time.',
    sys_fonts: 'Defaults to a summary. Use mode="list" with offset/limit/query to page through font names.',
    boot_progress: 'Returns progress plus human-readable details.',
    push_msg: 'Show a notification in the SiYuan UI. Optional timeout is in milliseconds.',
    push_err_msg: 'Show an error notification in the SiYuan UI. Optional timeout is in milliseconds.',
    get_version: 'Returns the current SiYuan version as {version}.',
    get_current_time: 'Returns the current system time as epoch milliseconds in {currentTime}.',
};

export const TOOL_GUIDANCE_BY_CATEGORY: Record<ToolCategory, string[]> = {
    notebook: NOTEBOOK_GUIDANCE,
    document: DOCUMENT_GUIDANCE,
    block: BLOCK_GUIDANCE,
    file: FILE_GUIDANCE,
    search: SEARCH_GUIDANCE,
    tag: TAG_GUIDANCE,
    system: SYSTEM_GUIDANCE,
};

export const TOOL_ACTION_HINTS: Record<ToolCategory, Partial<Record<string, string>>> = {
    notebook: NOTEBOOK_ACTION_HINTS,
    document: DOCUMENT_ACTION_HINTS,
    block: BLOCK_ACTION_HINTS,
    file: FILE_ACTION_HINTS,
    search: SEARCH_ACTION_HINTS,
    tag: TAG_ACTION_HINTS,
    system: SYSTEM_ACTION_HINTS,
};

export { ACTIONS_BY_CATEGORY } from './config';

export const TOOL_OVERVIEW_RESOURCE_URI = 'siyuan://help/tool-overview';
export const DOCUMENT_PATH_RESOURCE_URI = 'siyuan://help/document-path-semantics';
export const EXAMPLES_RESOURCE_URI = 'siyuan://help/examples';
export const ACTION_RESOURCE_TEMPLATE_URI = 'siyuan://help/action/{tool}/{action}';

export function getActionHint(tool?: string, action?: string): string | undefined {
    if (!tool || !action) return undefined;
    if (!(tool in TOOL_ACTION_HINTS)) return undefined;
    return TOOL_ACTION_HINTS[tool as ToolCategory]?.[action];
}

export function isKnownToolCategory(tool: string): tool is ToolCategory {
    return tool in ACTIONS_BY_CATEGORY;
}

export function isKnownAction(tool: ToolCategory, action: string): boolean {
    return ACTIONS_BY_CATEGORY[tool].includes(action);
}
