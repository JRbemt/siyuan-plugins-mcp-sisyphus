import {
    ACTIONS_BY_CATEGORY,
    type BlockAction,
    type DocumentAction,
    type FileAction,
    type NotebookAction,
    type SearchAction,
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
];

export const BLOCK_GUIDANCE: string[] = [
    'block(action="prepend") or block(action="append") with a document ID targets the document start or end.',
    'block(action="prepend") or block(action="append") with a block ID targets that block\'s child list.',
    'block(action="fold") and block(action="unfold") require a foldable block ID, not a document ID.',
];

export const FILE_GUIDANCE: string[] = [
    'file(action="upload_asset") expects a base64-encoded file payload.',
    'file(action="export_resources") exports the given paths as a ZIP archive.',
];

export const NOTEBOOK_ACTION_HINTS: Partial<Record<NotebookAction, string>> = {
    remove: 'This action requires explicit user confirmation.',
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
};

export const BLOCK_ACTION_HINTS: Partial<Record<BlockAction, string>> = {
    insert: 'nextID inserts BEFORE that block; previousID inserts AFTER that block. Provide at least one of nextID, previousID, or parentID.',
    prepend: 'parentID can be either a document ID or block ID; behavior differs.',
    append: 'parentID can be either a document ID or block ID; behavior differs.',
    delete: 'This action requires explicit user confirmation.',
    move: 'Provide id plus previousID, parentID, or both to describe the destination. This action requires explicit user confirmation.',
    fold: 'Use a foldable block ID.',
    unfold: 'Use a foldable block ID.',
    get_children: 'Accepts both document IDs and block IDs. Returns direct child blocks.',
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

export const TOOL_GUIDANCE_BY_CATEGORY: Record<ToolCategory, string[]> = {
    notebook: NOTEBOOK_GUIDANCE,
    document: DOCUMENT_GUIDANCE,
    block: BLOCK_GUIDANCE,
    file: FILE_GUIDANCE,
    search: SEARCH_GUIDANCE,
};

export const TOOL_ACTION_HINTS: Record<ToolCategory, Partial<Record<string, string>>> = {
    notebook: NOTEBOOK_ACTION_HINTS,
    document: DOCUMENT_ACTION_HINTS,
    block: BLOCK_ACTION_HINTS,
    file: FILE_ACTION_HINTS,
    search: SEARCH_ACTION_HINTS,
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
