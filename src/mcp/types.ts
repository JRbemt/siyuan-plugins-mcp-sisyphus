import { z } from "zod";

import { BLOCK_ACTIONS, DOCUMENT_ACTIONS, FILE_ACTIONS, MASCOT_ACTIONS, NOTEBOOK_ACTIONS, SEARCH_ACTIONS, SYSTEM_ACTIONS, TAG_ACTIONS } from "./config";

const NotebookConfSchema = z.object({
    name: z.string().optional(),
    closed: z.boolean().optional(),
    refCreateSavePath: z.string().optional(),
    createDocNameTemplate: z.string().optional(),
    dailyNoteSavePath: z.string().optional(),
    dailyNoteTemplatePath: z.string().optional(),
});

const DocumentReferenceSchema = z.object({
    id: z.string().optional(),
    notebook: z.string().optional(),
    path: z.string().optional(),
});

const DocumentPathReferenceSchema = DocumentReferenceSchema.superRefine((value, ctx) => {
    const hasId = typeof value.id === "string";
    const hasPathRef = typeof value.notebook === "string" || typeof value.path === "string";

    if (hasId === hasPathRef) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either id or notebook + path.",
        });
        return;
    }

    if (hasPathRef && (!value.notebook || !value.path)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Both notebook and path are required when id is not provided.",
        });
    }
});

const DocumentMoveReferenceSchema = z.object({
    fromPaths: z.array(z.string()).optional(),
    toNotebook: z.string().optional(),
    toPath: z.string().optional(),
    fromIDs: z.array(z.string()).optional(),
    toID: z.string().optional(),
}).superRefine((value, ctx) => {
    const hasPathMode = Array.isArray(value.fromPaths) || typeof value.toNotebook === "string" || typeof value.toPath === "string";
    const hasIdMode = Array.isArray(value.fromIDs) || typeof value.toID === "string";

    if (hasPathMode === hasIdMode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either fromPaths + toNotebook + toPath or fromIDs + toID.",
        });
        return;
    }

    if (hasPathMode && (!value.fromPaths || !value.toNotebook || !value.toPath)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "fromPaths, toNotebook, and toPath are required for path-based moves.",
        });
    }

    if (hasIdMode && (!value.fromIDs || !value.toID)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "fromIDs and toID are required for ID-based moves.",
        });
    }
});

export const NotebookActionSchema = z.enum(NOTEBOOK_ACTIONS);
export const DocumentActionSchema = z.enum(DOCUMENT_ACTIONS);
export const BlockActionSchema = z.enum(BLOCK_ACTIONS);
export const FileActionSchema = z.enum(FILE_ACTIONS);
export const MascotActionSchema = z.enum(MASCOT_ACTIONS);

export const NotebookListSchema = z.object({
    action: z.literal("list"),
});

export const NotebookCreateSchema = z.object({
    action: z.literal("create"),
    name: z.string().describe("Notebook name"),
    icon: z.string().optional().describe("Optional notebook icon. Prefer a Unicode hex code string such as '1f4d4' for 📔 instead of a raw emoji character."),
});

export const NotebookOpenSchema = z.object({
    action: z.literal("open"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookCloseSchema = z.object({
    action: z.literal("close"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookRemoveSchema = z.object({
    action: z.literal("remove"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookRenameSchema = z.object({
    action: z.literal("rename"),
    notebook: z.string().describe("Notebook ID"),
    name: z.string().describe("New notebook name"),
});

export const NotebookGetConfSchema = z.object({
    action: z.literal("get_conf"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookSetConfSchema = z.object({
    action: z.literal("set_conf"),
    notebook: z.string().describe("Notebook ID"),
    conf: NotebookConfSchema.describe("Notebook configuration"),
});

export const NotebookSetIconSchema = z.object({
    action: z.literal("set_icon"),
    notebook: z.string().describe("Notebook ID"),
    icon: z.string().describe("Icon value. Prefer a Unicode hex code string such as '1f4d4' for 📔; raw emoji characters may not render correctly. Custom icon paths are also supported."),
});

export const NotebookGetPermissionsSchema = z.object({
    action: z.literal("get_permissions"),
    notebook: z.string().optional().describe('Notebook ID, or "all" to return every notebook permission entry. Omit to return all notebooks.'),
});

export const NotebookSetPermissionSchema = z.object({
    action: z.literal("set_permission"),
    notebook: z.string().describe("Notebook ID"),
    permission: z.enum(["none", "r", "rw", "rwd"]).describe('Permission level: "none" blocks all access, "r" allows read only, "rw" allows read and write without delete, "rwd" allows read, write, and delete (default for new notebooks)'),
});

export const NotebookGetChildDocsSchema = z.object({
    action: z.literal("get_child_docs"),
    notebook: z.string().describe("Notebook ID"),
});

export const DocumentCreateSchema = z.object({
    action: z.literal("create"),
    notebook: z.string().describe("Notebook ID"),
    path: z.string().describe("Human-readable target path, must start with / (e.g., /foo/bar). Parent paths must already exist."),
    markdown: z.string().describe("Markdown content"),
    icon: z.string().optional().describe("Optional document icon. Prefer a Unicode hex code string such as '1f4d4' for 📔 instead of a raw emoji character."),
});

export const DocumentRenameSchema = z.object({
    action: z.literal("rename"),
    title: z.string().describe("New document title"),
}).and(DocumentPathReferenceSchema);

export const DocumentRemoveSchema = z.object({
    action: z.literal("remove"),
}).and(DocumentPathReferenceSchema);

export const DocumentMoveSchema = z.object({
    action: z.literal("move"),
}).and(DocumentMoveReferenceSchema);

export const DocumentGetPathSchema = z.object({
    action: z.literal("get_path"),
    id: z.string().describe("Document ID"),
});

export const DocumentGetHPathSchema = z.object({
    action: z.literal("get_hpath"),
}).and(DocumentPathReferenceSchema);

export const DocumentGetIdsSchema = z.object({
    action: z.literal("get_ids"),
    path: z.string().describe("Human-readable path (e.g., /foo/bar)"),
    notebook: z.string().describe("Notebook ID"),
});

export const DocumentGetChildBlocksSchema = z.object({
    action: z.literal("get_child_blocks"),
    id: z.string().describe("Document ID"),
});

export const DocumentGetChildDocsSchema = z.object({
    action: z.literal("get_child_docs"),
    id: z.string().describe("Document ID"),
});

export const DocumentSetIconSchema = z.object({
    action: z.literal("set_icon"),
    id: z.string().describe("Document ID"),
    icon: z.string().describe("Icon value. Prefer a Unicode hex code string such as '1f4d4' for 📔; raw emoji characters may not render correctly. Custom icon paths are also supported."),
});

export const DocumentSetCoverSchema = z.object({
    action: z.literal("set_cover"),
    id: z.string().describe("Document ID"),
    source: z.string().describe("Cover image source. Accepts http(s) URLs or SiYuan asset paths like /assets/foo.png."),
});

export const DocumentClearCoverSchema = z.object({
    action: z.literal("clear_cover"),
    id: z.string().describe("Document ID"),
});

export const DocumentListTreeSchema = z.object({
    action: z.literal("list_tree"),
    notebook: z.string().describe("Notebook ID"),
    path: z.string().describe("Storage path or / for the notebook root"),
    maxDepth: z.number().optional().describe("Max tree depth to return (default 3). Deeper nodes are collapsed to childCount."),
});

export const DocumentSearchDocsSchema = z.object({
    action: z.literal("search_docs"),
    notebook: z.string().describe("Notebook ID"),
    query: z.string().describe("Keyword to search in document titles"),
    path: z.string().optional().describe("Optional storage path to narrow the search scope after permission filtering"),
});

export const DocumentGetDocSchema = z.object({
    action: z.literal("get_doc"),
    id: z.string().describe("Document ID"),
    mode: z.enum(["markdown", "html"]).optional().describe('Return mode: "markdown" (default) or "html"'),
    size: z.number().optional().describe("Optional maximum content size hint"),
    page: z.number().int().min(1).optional().describe('Page number for markdown pagination (1-based)'),
    pageSize: z.number().int().min(1).max(20000).optional().describe('Characters per page for markdown pagination (default 8000)'),
});

export const DocumentCreateDailyNoteSchema = z.object({
    action: z.literal("create_daily_note"),
    notebook: z.string().describe("Notebook ID"),
    app: z.string().optional().describe("Optional app identifier passed through to SiYuan"),
});

export const MascotGetBalanceSchema = z.object({
    action: z.literal("get_balance"),
});

export const MascotShopSchema = z.object({
    action: z.literal("shop"),
});

export const MascotBuySchema = z.object({
    action: z.literal("buy"),
    item_id: z.string().describe("Stable shop item ID returned by mascot(action=\"shop\")"),
});

export const BlockInsertSchema = z.object({
    action: z.literal("insert"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
    nextID: z.string().optional().describe("Next block ID"),
    previousID: z.string().optional().describe("Previous block ID"),
    parentID: z.string().optional().describe("Parent block or document ID"),
});

export const BlockPrependSchema = z.object({
    action: z.literal("prepend"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
    parentID: z.string().describe("Parent block or document ID"),
});

export const BlockAppendSchema = z.object({
    action: z.literal("append"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
    parentID: z.string().describe("Parent block or document ID"),
});

export const BlockUpdateSchema = z.object({
    action: z.literal("update"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("New block content"),
    id: z.string().describe("Block ID"),
});

export const BlockDeleteSchema = z.object({
    action: z.literal("delete"),
    id: z.string().describe("Block ID"),
});

export const BlockMoveSchema = z.object({
    action: z.literal("move"),
    id: z.string().describe("Block ID"),
    previousID: z.string().optional().describe("Previous block ID"),
    parentID: z.string().optional().describe("New parent block ID"),
}).superRefine((value, ctx) => {
    if (!value.previousID && !value.parentID) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide previousID, parentID, or both to describe the destination.",
            path: ["previousID"],
        });
    }
});

export const BlockFoldSchema = z.object({
    action: z.literal("fold"),
    id: z.string().describe("Foldable block ID"),
});

export const BlockUnfoldSchema = z.object({
    action: z.literal("unfold"),
    id: z.string().describe("Foldable block ID"),
});

export const BlockGetKramdownSchema = z.object({
    action: z.literal("get_kramdown"),
    id: z.string().describe("Block ID or document ID"),
});

export const BlockGetChildrenSchema = z.object({
    action: z.literal("get_children"),
    id: z.string().describe("Block ID or document ID"),
    page: z.number().int().min(1).optional().describe('Page number (1-based), default 1'),
    pageSize: z.number().int().min(1).max(200).optional().describe('Items per page, default 50'),
});

export const BlockTransferRefSchema = z.object({
    action: z.literal("transfer_ref"),
    fromID: z.string().describe("Source block ID"),
    toID: z.string().describe("Target block ID"),
    refIDs: z.array(z.string()).optional().describe("Reference block IDs"),
});

export const BlockSetAttrsSchema = z.object({
    action: z.literal("set_attrs"),
    id: z.string().describe("Block ID"),
    attrs: z.record(z.string(), z.string()).describe("Block attributes"),
});

export const BlockGetAttrsSchema = z.object({
    action: z.literal("get_attrs"),
    id: z.string().describe("Block ID"),
});

export const BlockExistsSchema = z.object({
    action: z.literal("exists"),
    id: z.string().describe("Block ID"),
});

export const BlockInfoSchema = z.object({
    action: z.literal("info"),
    id: z.string().describe("Block ID"),
});

export const BlockBreadcrumbSchema = z.object({
    action: z.literal("breadcrumb"),
    id: z.string().describe("Block ID"),
    excludeTypes: z.array(z.string()).optional().describe("Optional block types to exclude from the breadcrumb"),
});

export const BlockDomSchema = z.object({
    action: z.literal("dom"),
    id: z.string().describe("Block ID"),
});

export const BlockRecentUpdatedSchema = z.object({
    action: z.literal("recent_updated"),
    count: z.number().optional().describe("Maximum number of recent readable blocks to return after permission filtering"),
});

export const BlockWordCountSchema = z.object({
    action: z.literal("word_count"),
    ids: z.array(z.string()).describe("One or more block IDs"),
});

export const FileUploadAssetSchema = z.object({
    action: z.literal("upload_asset"),
    assetsDirPath: z.string().describe("Asset directory path (e.g., /assets/)"),
    localFilePath: z.string().describe("Local file path to read and upload into the assets directory"),
    confirmLargeFile: z.boolean().optional().describe("Set to true only after the user explicitly confirms uploading a file larger than the configured safety threshold."),
});

export const FileRenderTemplateSchema = z.object({
    action: z.literal("render_template"),
    id: z.string().describe("Document ID for template context"),
    path: z.string().describe("Template file absolute path"),
});

export const FileRenderSprigSchema = z.object({
    action: z.literal("render_sprig"),
    template: z.string().describe("Sprig template content"),
});

export const FileExportMdSchema = z.object({
    action: z.literal("export_md"),
    id: z.string().describe("Document ID to export"),
});

export const FileExportResourcesSchema = z.object({
    action: z.literal("export_resources"),
    paths: z.array(z.string()).describe("Paths to export"),
    name: z.string().optional().describe("Export file name"),
    outputPath: z.string().optional().describe("Optional local absolute or relative filesystem path to save the exported ZIP"),
});

export const SearchActionSchema = z.enum(SEARCH_ACTIONS);

export const SearchFulltextSchema = z.object({
    action: z.literal("fulltext"),
    query: z.string().describe("Search query string"),
    method: z.number().optional().describe("Search method: 0=keyword (default), 1=query syntax, 2=SQL, 3=regex"),
    types: z.record(z.string(), z.boolean()).optional().describe("Block type filter, e.g. {\"heading\": true, \"paragraph\": true}"),
    paths: z.array(z.string()).optional().describe("Restrict search to specific notebook paths"),
    groupBy: z.number().optional().describe("0=no grouping (default), 1=group by document"),
    orderBy: z.number().optional().describe("Sort order: 0=type, 1=created ASC, 2=created DESC, 3=updated ASC, 4=updated DESC, 5=content ASC, 6=content DESC, 7=relevance (default)"),
    page: z.number().optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().optional().describe("Results per page, default 32, max 128"),
    stripHtml: z.boolean().optional().describe("When true, preserves highlighted HTML while adding plain-text fields for easier downstream parsing"),
});

export const SearchQuerySqlSchema = z.object({
    action: z.literal("query_sql"),
    stmt: z.string().describe("SQL SELECT statement to execute against the blocks/spans/assets tables; returned rows are permission-filtered"),
});

export const SearchTagSchema = z.object({
    action: z.literal("search_tag"),
    k: z.string().describe("Tag keyword to search for"),
});

export const SearchGetBacklinksSchema = z.object({
    action: z.literal("get_backlinks"),
    id: z.string().describe("Block or document ID to find backlinks for"),
    keyword: z.string().optional().describe("Filter backlinks by keyword"),
    refTreeID: z.string().optional().describe("Optional document tree ID to narrow backlink scope"),
});

export const SearchGetBackmentionsSchema = z.object({
    action: z.literal("get_backmentions"),
    id: z.string().describe("Block or document ID to find backmentions for"),
    keyword: z.string().optional().describe("Filter backmentions by keyword"),
    refTreeID: z.string().optional().describe("Optional document tree ID to narrow backmention scope"),
});

export const TagActionSchema = z.enum(TAG_ACTIONS);

export const TagListSchema = z.object({
    action: z.literal("list"),
    sort: z.number().optional().describe("Optional tag sort mode"),
    ignoreMaxListHint: z.boolean().optional().describe("Ignore the maximum list hint from SiYuan"),
    app: z.string().optional().describe("Optional app identifier passed through to SiYuan"),
});

export const TagRenameSchema = z.object({
    action: z.literal("rename"),
    oldLabel: z.string().describe("Existing tag label"),
    newLabel: z.string().describe("New tag label"),
});

export const TagRemoveSchema = z.object({
    action: z.literal("remove"),
    label: z.string().describe("Tag label to remove"),
});

export const SystemActionSchema = z.enum(SYSTEM_ACTIONS);

export const SystemWorkspaceInfoSchema = z.object({
    action: z.literal("workspace_info"),
});

export const SystemNetworkSchema = z.object({
    action: z.literal("network"),
});

export const SystemChangelogSchema = z.object({
    action: z.literal("changelog"),
});

export const SystemConfSchema = z.object({
    action: z.literal("conf"),
    mode: z.enum(["summary", "get"]).optional().describe('Read mode: "summary" returns a navigable overview, "get" reads a specific key path'),
    keyPath: z.string().optional().describe('Dot/bracket path to a specific config field, e.g. "conf.appearance.mode" or "conf.langs[0]"'),
    maxDepth: z.number().int().min(0).max(5).optional().describe('Maximum object traversal depth for summary/get responses'),
    maxItems: z.number().int().min(1).max(100).optional().describe('Maximum keys/items to include per level'),
});

export const SystemSysFontsSchema = z.object({
    action: z.literal("sys_fonts"),
    mode: z.enum(["summary", "list"]).optional().describe('Read mode: "summary" returns counts and samples, "list" returns paginated items'),
    offset: z.number().int().min(0).optional().describe('Pagination offset for list mode'),
    limit: z.number().int().min(1).max(200).optional().describe('Pagination size for list mode'),
    query: z.string().optional().describe('Optional keyword filter for font names'),
});

export const SystemBootProgressSchema = z.object({
    action: z.literal("boot_progress"),
});

export const SystemPushMsgSchema = z.object({
    action: z.literal("push_msg"),
    msg: z.string().describe("Message content"),
    timeout: z.number().optional().describe("Display timeout in milliseconds"),
});

export const SystemPushErrMsgSchema = z.object({
    action: z.literal("push_err_msg"),
    msg: z.string().describe("Error message content"),
    timeout: z.number().optional().describe("Display timeout in milliseconds"),
});

export const SystemGetVersionSchema = z.object({
    action: z.literal("get_version"),
});

export const SystemGetCurrentTimeSchema = z.object({
    action: z.literal("get_current_time"),
});
