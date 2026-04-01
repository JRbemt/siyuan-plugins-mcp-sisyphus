import type { SiYuanClient } from '../../api/client';
import * as searchApi from '../../api/search';
import type { CategoryToolConfig, SearchAction } from '../config';
import { SEARCH_ACTION_HINTS, SEARCH_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    SearchActionSchema,
    SearchFulltextSchema,
    SearchGetBacklinksSchema,
    SearchGetBackmentionsSchema,
    SearchQuerySqlSchema,
    SearchTagSchema,
} from '../types';
import { ensurePermissionForDocumentId } from './context';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, type ActionVariant, type ToolResult } from './shared';

export const SEARCH_TOOL_NAME = 'search';

export const SEARCH_VARIANTS: ActionVariant<SearchAction>[] = [
    {
        action: 'fulltext',
        schema: createActionSchema('fulltext', {
            query: { type: 'string', description: 'Search query string' },
            method: { type: 'number', description: 'Search method: 0=keyword (default), 1=query syntax, 2=SQL, 3=regex' },
            types: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Block type filter, e.g. {"heading": true, "paragraph": true}' },
            paths: { type: 'array', items: { type: 'string' }, description: 'Restrict search to specific notebook paths' },
            groupBy: { type: 'number', description: '0=no grouping (default), 1=group by document' },
            orderBy: { type: 'number', description: 'Sort order: 0=type, 1=created ASC, 2=created DESC, 3=updated ASC, 4=updated DESC, 5=content ASC, 6=content DESC, 7=relevance (default)' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Results per page, default 32, max 128' },
        }, ['query'], 'Full-text search across all blocks.'),
    },
    {
        action: 'query_sql',
        schema: createActionSchema('query_sql', {
            stmt: { type: 'string', description: 'SQL SELECT statement to execute against the blocks/spans/assets tables' },
        }, ['stmt'], 'Execute a read-only SQL query against the database.'),
    },
    {
        action: 'search_tag',
        schema: createActionSchema('search_tag', {
            k: { type: 'string', description: 'Tag keyword to search for' },
        }, ['k'], 'Search for tags matching a keyword.'),
    },
    {
        action: 'get_backlinks',
        schema: createActionSchema('get_backlinks', {
            id: { type: 'string', description: 'Block or document ID to find backlinks for' },
            keyword: { type: 'string', description: 'Filter backlinks by keyword' },
        }, ['id'], 'Find documents/blocks that link to the given block.'),
    },
    {
        action: 'get_backmentions',
        schema: createActionSchema('get_backmentions', {
            id: { type: 'string', description: 'Block or document ID to find backmentions for' },
            keyword: { type: 'string', description: 'Filter backmentions by keyword' },
        }, ['id'], 'Find documents/blocks that mention the given block name.'),
    },
];

export function listSearchTools(config: CategoryToolConfig<SearchAction>) {
    return buildAggregatedTool(
        SEARCH_TOOL_NAME,
        'Grouped search and query operations.',
        config,
        SEARCH_VARIANTS,
        {
            guidance: SEARCH_GUIDANCE,
            actionHints: SEARCH_ACTION_HINTS,
        },
    );
}

export async function callSearchTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<SearchAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    try {
        const parsedAction = SearchActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(SEARCH_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'fulltext': {
                const parsed = SearchFulltextSchema.parse(rawArgs);
                const result = await searchApi.fullTextSearchBlock(client, {
                    query: parsed.query,
                    method: parsed.method,
                    types: parsed.types,
                    paths: parsed.paths,
                    groupBy: parsed.groupBy,
                    orderBy: parsed.orderBy,
                    page: parsed.page,
                    pageSize: parsed.pageSize,
                });
                return createJsonResult(result);
            }
            case 'query_sql': {
                const parsed = SearchQuerySqlSchema.parse(rawArgs);
                const trimmed = parsed.stmt.trim();
                const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
                if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
                    return createErrorResult(
                        new Error('Only SELECT and WITH (CTE) statements are allowed. Mutation queries (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE) are forbidden.'),
                        { tool: SEARCH_TOOL_NAME, action: 'query_sql', rawArgs },
                    );
                }
                const result = await searchApi.querySQL(client, parsed.stmt);
                return createJsonResult(result);
            }
            case 'search_tag': {
                const parsed = SearchTagSchema.parse(rawArgs);
                const result = await searchApi.searchTag(client, parsed.k);
                return createJsonResult(result);
            }
            case 'get_backlinks': {
                const parsed = SearchGetBacklinksSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) return denied;
                const result = await searchApi.getBacklinkDoc(client, parsed.id, parsed.keyword);
                return createJsonResult(result);
            }
            case 'get_backmentions': {
                const parsed = SearchGetBackmentionsSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) return denied;
                const result = await searchApi.getBackmentionDoc(client, parsed.id, parsed.keyword);
                return createJsonResult(result);
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: SEARCH_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: SEARCH_TOOL_NAME, action, rawArgs });
    }
}
