import type { SiYuanClient } from '../../api/client';
import * as avApi from '../../api/av';
import * as blockApi from '../../api/block';
import type { AvAction, CategoryToolConfig } from '../config';
import { AV_ACTION_HINTS, AV_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    AvActionSchema,
    AvAddColumnSchema,
    AvAddRowsSchema,
    AvBatchSetCellsSchema,
    AvDuplicateBlockSchema,
    AvGetPrimaryKeyValuesSchema,
    AvGetSchema,
    AvRemoveColumnSchema,
    AvRemoveRowsSchema,
    AvSearchSchema,
    AvSetCellSchema,
} from '../types';
import { createResultResolutionCache, ensurePermissionForDocumentId, resolveDocumentContextById, resolveResultItemContext } from './context';
import { isMissingBlockError } from './block';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, createWriteSuccessResult, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';

export const AV_TOOL_NAME = 'av';

type StrongCellValueInput = {
    valueType: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'multi_select' | 'relation' | 'url' | 'email' | 'phone';
    text?: string;
    number?: number;
    numberFormat?: string;
    date?: string | number;
    endDate?: string | number;
    includeTime?: boolean;
    checked?: boolean;
    option?: string;
    options?: string[];
    relationBlockIDs?: string[];
    url?: string;
    email?: string;
    phone?: string;
};

export const AV_VARIANTS: ActionVariant<AvAction>[] = [
    {
        action: 'get',
        schema: createActionSchema('get', {
            id: { type: 'string', description: 'Attribute view ID' },
        }, ['id'], 'Get the full attribute view payload by AV ID.'),
    },
    {
        action: 'search',
        schema: createActionSchema('search', {
            keyword: { type: 'string', description: 'Keyword to search in attribute view names' },
            excludes: { type: 'array', items: { type: 'string' }, description: 'Optional AV IDs to exclude' },
        }, ['keyword'], 'Search attribute views by keyword.'),
    },
    {
        action: 'add_rows',
        schema: createActionSchema('add_rows', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockIDs: { type: 'array', items: { type: 'string' }, description: 'Existing block IDs to add as rows' },
            blockID: { type: 'string', description: 'Optional database block ID' },
            viewID: { type: 'string', description: 'Optional target view ID' },
            groupID: { type: 'string', description: 'Optional target group ID' },
            previousID: { type: 'string', description: 'Optional previous row item ID' },
            ignoreDefaultFill: { type: 'boolean', description: 'Skip default fill from filters/groups' },
        }, ['avID', 'blockIDs'], 'Add existing blocks as rows in an attribute view.'),
    },
    {
        action: 'remove_rows',
        schema: createActionSchema('remove_rows', {
            avID: { type: 'string', description: 'Attribute view ID' },
            srcIDs: { type: 'array', items: { type: 'string' }, description: 'Bound row block/item IDs to remove' },
        }, ['avID', 'srcIDs'], 'Remove rows from an attribute view by source IDs.'),
    },
    {
        action: 'add_column',
        schema: createActionSchema('add_column', {
            avID: { type: 'string', description: 'Attribute view ID' },
            keyID: { type: 'string', description: 'Optional new column key ID; MCP generates one when omitted' },
            keyName: { type: 'string', description: 'New column name' },
            keyType: { type: 'string', enum: ['text', 'number', 'date', 'select', 'mSelect', 'url', 'email', 'phone', 'template', 'created', 'updated', 'checkbox', 'relation', 'rollup'], description: 'Column type' },
            keyIcon: { type: 'string', description: 'Optional column icon' },
            previousKeyID: { type: 'string', description: 'Insert after this key ID' },
        }, ['avID', 'keyName', 'keyType'], 'Add a column to an attribute view.'),
    },
    {
        action: 'remove_column',
        schema: createActionSchema('remove_column', {
            avID: { type: 'string', description: 'Attribute view ID' },
            keyID: { type: 'string', description: 'Column key ID' },
            columnID: { type: 'string', description: 'Alias of keyID' },
            removeRelationDest: { type: 'boolean', description: 'Also remove reverse relation metadata' },
        }, ['avID'], 'Remove a column from an attribute view.'),
    },
    {
        action: 'set_cell',
        schema: createActionSchema('set_cell', {
            avID: { type: 'string', description: 'Attribute view ID' },
            rowID: { type: 'string', description: 'Row item ID' },
            columnID: { type: 'string', description: 'Column key ID' },
            valueType: { type: 'string', enum: ['text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'relation', 'url', 'email', 'phone'], description: 'Cell value type' },
            text: { type: 'string', description: 'Text value when valueType=text' },
            number: { type: 'number', description: 'Number value when valueType=number' },
            numberFormat: { type: 'string', description: 'Optional number format such as commas, percent, USD, or CNY' },
            date: { description: 'Date/time value as ISO text or epoch milliseconds when valueType=date' },
            endDate: { description: 'Optional end date as ISO text or epoch milliseconds for ranged dates' },
            includeTime: { type: 'boolean', description: 'When false, store only the date component' },
            checked: { type: 'boolean', description: 'Checkbox state when valueType=checkbox' },
            option: { type: 'string', description: 'Selected option label when valueType=select' },
            options: { type: 'array', items: { type: 'string' }, description: 'Selected option labels when valueType=multi_select' },
            relationBlockIDs: { type: 'array', items: { type: 'string' }, description: 'Related block IDs when valueType=relation' },
            url: { type: 'string', description: 'URL value when valueType=url' },
            email: { type: 'string', description: 'Email value when valueType=email' },
            phone: { type: 'string', description: 'Phone value when valueType=phone' },
        }, ['avID', 'rowID', 'columnID', 'valueType'], 'Update one attribute view cell using a strong typed input shape.'),
    },
    {
        action: 'batch_set_cells',
        schema: createActionSchema('batch_set_cells', {
            avID: { type: 'string', description: 'Attribute view ID' },
            items: { type: 'array', description: 'Batch cell updates' },
        }, ['avID', 'items'], 'Batch update multiple attribute view cells.'),
    },
    {
        action: 'duplicate_block',
        schema: createActionSchema('duplicate_block', {
            avID: { type: 'string', description: 'Source attribute view ID' },
        }, ['avID'], 'Duplicate a database block from an existing attribute view.'),
    },
    {
        action: 'get_primary_key_values',
        schema: createActionSchema('get_primary_key_values', {
            avID: { type: 'string', description: 'Attribute view ID' },
            keyword: { type: 'string', description: 'Optional keyword filter for primary key values' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Rows per page, default all' },
        }, ['avID'], 'Get primary key values for an attribute view.'),
    },
];

export function listAvTools(config: CategoryToolConfig<AvAction>) {
    return buildAggregatedTool(
        AV_TOOL_NAME,
        '🗃️ Grouped attribute-view (database) operations.',
        config,
        AV_VARIANTS,
        {
            guidance: AV_GUIDANCE,
            actionHints: AV_ACTION_HINTS,
        },
    );
}

interface AvHandlerContext {
    client: SiYuanClient;
    permMgr: PermissionManager;
    rawArgs: Record<string, unknown>;
}

type DuplicateVerificationResult = {
    duplicatedBlockExists: boolean;
    duplicatedAvReadable: boolean;
};

function generateSiYuanNodeId(now = new Date()): string {
    const pad = (value: number, length = 2) => String(value).padStart(length, '0');
    const timestamp = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join('');
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let index = 0; index < 7; index += 1) {
        suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `${timestamp}-${suffix}`;
}

type AvContextResolution = {
    avData: unknown;
    blockID?: string;
};

type AvRowBinding = {
    rowID?: string;
    blockID?: string;
};

type AvRowLookup = {
    rows: AvRowBinding[];
    rowIDs: Set<string>;
    sourceToRowIDs: Map<string, string[]>;
};

function extractFirstRowBlockId(avData: unknown): string | undefined {
    if (!avData || typeof avData !== 'object') return undefined;
    const keyValues = (avData as { keyValues?: unknown }).keyValues;
    if (!Array.isArray(keyValues)) return undefined;

    for (const entry of keyValues) {
        if (!entry || typeof entry !== 'object') continue;
        const typedEntry = entry as {
            key?: { type?: string };
            values?: Array<{ blockID?: string }>;
        };
        if (typedEntry.key?.type !== 'block' || !Array.isArray(typedEntry.values)) continue;
        const blockValue = typedEntry.values.find((value) => typeof value?.blockID === 'string' && value.blockID.length > 0);
        if (blockValue?.blockID) return blockValue.blockID;
    }
    return undefined;
}

function getStringField(value: unknown, fieldNames: string[]): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    for (const fieldName of fieldNames) {
        const fieldValue = record[fieldName];
        if (typeof fieldValue === 'string' && fieldValue.length > 0) {
            return fieldValue;
        }
    }
    return undefined;
}

function getNestedStringField(value: unknown, path: string[]): string | undefined {
    let current = value;
    for (const segment of path) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' && current.length > 0 ? current : undefined;
}

function extractRowIdFromValue(value: unknown): string | undefined {
    return getStringField(value, ['id', 'itemId', 'itemID', 'rowID']);
}

function extractSourceBlockIdFromValue(value: unknown): string | undefined {
    return getStringField(value, ['blockID', 'srcID', 'srcId'])
        ?? getNestedStringField(value, ['block', 'id'])
        ?? getNestedStringField(value, ['block', 'blockID']);
}

function extractAvRowLookup(avData: unknown): AvRowLookup {
    const rowsByIndex = new Map<number, AvRowBinding>();
    if (!avData || typeof avData !== 'object') {
        return { rows: [], rowIDs: new Set<string>(), sourceToRowIDs: new Map<string, string[]>() };
    }

    const keyValues = (avData as { keyValues?: unknown }).keyValues;
    if (!Array.isArray(keyValues)) {
        return { rows: [], rowIDs: new Set<string>(), sourceToRowIDs: new Map<string, string[]>() };
    }

    for (const entry of keyValues) {
        if (!entry || typeof entry !== 'object') continue;
        const values = (entry as { values?: unknown }).values;
        if (!Array.isArray(values)) continue;

        values.forEach((value, index) => {
            const row = rowsByIndex.get(index) ?? {};
            const rowID = extractRowIdFromValue(value);
            const blockID = extractSourceBlockIdFromValue(value);
            if (rowID) row.rowID = rowID;
            if (blockID) row.blockID = blockID;
            if (rowID || blockID) {
                rowsByIndex.set(index, row);
            }
        });
    }

    const rows = [...rowsByIndex.values()].filter((row) => row.rowID || row.blockID);
    const rowIDs = new Set<string>();
    const sourceToRowIDs = new Map<string, string[]>();

    for (const row of rows) {
        if (row.rowID) rowIDs.add(row.rowID);
        if (!row.blockID || !row.rowID) continue;
        const matches = sourceToRowIDs.get(row.blockID) ?? [];
        if (!matches.includes(row.rowID)) {
            matches.push(row.rowID);
            sourceToRowIDs.set(row.blockID, matches);
        }
    }

    return { rows, rowIDs, sourceToRowIDs };
}

function createAvRowIdErrorResult(
    action: 'set_cell' | 'batch_set_cells',
    payload: Record<string, unknown>,
): ToolResult {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                error: {
                    type: 'validation_error',
                    tool: AV_TOOL_NAME,
                    action,
                    ...payload,
                },
            }, null, 2),
        }],
        isError: true,
    };
}

function validateRowIdForAv(
    avID: string,
    action: 'set_cell' | 'batch_set_cells',
    rowLookup: AvRowLookup,
    requestedRowID: string,
    itemIndex?: number,
): { ok: true; rowID: string } | { ok: false; result: ToolResult } {
    if (rowLookup.rowIDs.has(requestedRowID)) {
        return { ok: true, rowID: requestedRowID };
    }

    const matchingRowIDs = rowLookup.sourceToRowIDs.get(requestedRowID);
    if (matchingRowIDs && matchingRowIDs.length === 1) {
        return {
            ok: false,
            result: createAvRowIdErrorResult(action, {
                reason: 'row_id_required',
                message: `rowID "${requestedRowID}" is a source block ID in attribute view "${avID}". Use the row item ID instead.`,
                avID,
                rowID: requestedRowID,
                detectedSourceBlockID: requestedRowID,
                suggestedRowID: matchingRowIDs[0],
                ...(itemIndex === undefined ? {} : { itemIndex }),
                hint: 'Use the rowID returned by av(action="add_rows"), or read the database again and map source blockID -> row item ID before calling set_cell/batch_set_cells.',
            }),
        };
    }

    if (matchingRowIDs && matchingRowIDs.length > 1) {
        return {
            ok: false,
            result: createAvRowIdErrorResult(action, {
                reason: 'row_id_ambiguous',
                message: `rowID "${requestedRowID}" matches multiple rows in attribute view "${avID}". Pass a concrete row item ID instead of the source block ID.`,
                avID,
                rowID: requestedRowID,
                detectedSourceBlockID: requestedRowID,
                candidateRowIDs: matchingRowIDs,
                ...(itemIndex === undefined ? {} : { itemIndex }),
                hint: 'Use the exact row item ID returned by av(action="add_rows"), or inspect the AV payload to choose the intended row binding.',
            }),
        };
    }

    return {
        ok: false,
        result: createAvRowIdErrorResult(action, {
            reason: 'row_id_not_found',
            message: `rowID "${requestedRowID}" does not exist in attribute view "${avID}". Pass the database row item ID, not the source block ID.`,
            avID,
            rowID: requestedRowID,
            ...(itemIndex === undefined ? {} : { itemIndex }),
            hint: 'Use the rowID returned by av(action="add_rows"), or call av(action="get") to map the source block to its row item ID.',
        }),
    };
}

async function resolveAvContext(
    client: SiYuanClient,
    avData: unknown,
): Promise<AvContextResolution> {
    const directContext = await resolveResultItemContext(client, avData);
    if (directContext?.documentId) {
        return { avData, blockID: directContext.documentId };
    }

    const blockID = extractFirstRowBlockId(avData);
    return { avData, blockID };
}

async function ensurePermissionForAvId(
    client: SiYuanClient,
    permMgr: PermissionManager,
    avID: string,
    required: 'read' | 'write',
): Promise<{ denied: ToolResult | null; avData: unknown }> {
    const response = await avApi.getAttributeView(client, avID);
    const avData = response.av;
    const resolved = await resolveAvContext(client, avData);
    const candidateBlockIDs = [];
    if (resolved.blockID) {
        candidateBlockIDs.push(resolved.blockID);
    }

    try {
        const mirrors = await avApi.getMirrorDatabaseBlocks(client, avID);
        for (const entry of mirrors.refDefs ?? []) {
            const refID = typeof entry?.refID === 'string' && entry.refID.length > 0 ? entry.refID : undefined;
            if (refID && !candidateBlockIDs.includes(refID)) {
                candidateBlockIDs.push(refID);
            }
        }
    } catch (error) {
        if (!isMissingBlockError(error)) {
            throw error;
        }
    }

    for (const candidateBlockID of candidateBlockIDs) {
        try {
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, candidateBlockID, required);
            return { denied, avData };
        } catch (error) {
            if (isMissingBlockError(error)) continue;
            throw error;
        }
    }

    if (candidateBlockIDs.length === 0) {
        throw new Error(`Unable to resolve notebook permission scope for attribute view "${avID}". The database may have no rows yet; AV writes require a resolvable owning block context.`);
    }
    throw new Error(`Unable to resolve notebook permission scope for attribute view "${avID}" because all known owning block references are stale or missing.`);
}

async function filterAvSearchResultsByPermission(
    client: SiYuanClient,
    permMgr: PermissionManager,
    results: unknown[],
): Promise<{
    results: unknown[];
    unresolvedResults: unknown[];
    filteredOutCount: number;
    rawResultCount: number;
    unresolvedCount: number;
    permissionFilteredOutCount: number;
    partial?: boolean;
    reason?: string;
}> {
    const cache = createResultResolutionCache();
    await permMgr.reload();

    const filtered: unknown[] = [];
    const unresolvedResults: unknown[] = [];
    let filteredOutCount = 0;
    let unresolvedCount = 0;
    let permissionFilteredOutCount = 0;

    for (const result of results) {
        const context = await resolveResultItemContext(client, result, cache);
        if (!context?.notebook) {
            filteredOutCount += 1;
            unresolvedCount += 1;
            unresolvedResults.push(result);
            continue;
        }
        if (!permMgr.canRead(context.notebook)) {
            filteredOutCount += 1;
            permissionFilteredOutCount += 1;
            continue;
        }
        filtered.push(result);
    }

    return {
        results: filtered,
        unresolvedResults,
        rawResultCount: results.length,
        filteredOutCount,
        unresolvedCount,
        permissionFilteredOutCount,
        ...(filteredOutCount > 0 ? { partial: true, reason: permissionFilteredOutCount > 0 ? 'permission_filtered' : 'context_unresolved' } : {}),
    };
}

async function validateDuplicatedAvResult(
    client: SiYuanClient,
    permMgr: PermissionManager,
    sourceAvID: string,
    duplicated: { avID?: string; blockID?: string },
): Promise<{ avData: unknown; verification: DuplicateVerificationResult }> {
    if (!duplicated.avID || !duplicated.blockID) {
        throw new Error(`Duplicate AV returned incomplete identifiers for source "${sourceAvID}".`);
    }

    const blockExists = await blockApi.checkBlockExist(client, duplicated.blockID);
    if (!blockExists) {
        const error = new Error(`Duplicate AV verification failed: returned block "${duplicated.blockID}" does not exist.`);
        (error as Error & { verification?: DuplicateVerificationResult }).verification = {
            duplicatedBlockExists: false,
            duplicatedAvReadable: false,
        };
        throw error;
    }

    try {
        const { avData } = await ensurePermissionForAvId(client, permMgr, duplicated.avID, 'read');
        return {
            avData,
            verification: {
                duplicatedBlockExists: true,
                duplicatedAvReadable: true,
            },
        };
    } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        (normalized as Error & { verification?: DuplicateVerificationResult }).verification = {
            duplicatedBlockExists: true,
            duplicatedAvReadable: false,
        };
        throw normalized;
    }
}

function parseDateMillis(value: string | number, fieldName: string): number {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`${fieldName} must be a finite epoch millisecond value.`);
        return value;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
        throw new Error(`${fieldName} must be a valid ISO date string or epoch milliseconds.`);
    }
    return parsed;
}

function buildStrongCellValue(
    columnID: string,
    rowID: string,
    input: StrongCellValueInput,
): Record<string, unknown> {
    const base: Record<string, unknown> = {
        keyID: columnID,
        blockID: rowID,
    };

    switch (input.valueType) {
        case 'text':
            return { ...base, type: 'text', text: { content: input.text } };
        case 'number':
            return {
                ...base,
                type: 'number',
                number: {
                    content: input.number,
                    isNotEmpty: true,
                    format: input.numberFormat ?? '',
                    formattedContent: '',
                },
            };
        case 'date': {
            const content = parseDateMillis(input.date!, 'date');
            const content2 = input.endDate === undefined ? 0 : parseDateMillis(input.endDate, 'endDate');
            return {
                ...base,
                type: 'date',
                date: {
                    content,
                    isNotEmpty: true,
                    hasEndDate: input.endDate !== undefined,
                    isNotTime: input.includeTime === false,
                    content2,
                    isNotEmpty2: input.endDate !== undefined,
                    formattedContent: '',
                },
            };
        }
        case 'checkbox':
            return { ...base, type: 'checkbox', checkbox: { checked: Boolean(input.checked) } };
        case 'select':
            return { ...base, type: 'select', mSelect: [{ content: input.option, color: '' }] };
        case 'multi_select':
            return { ...base, type: 'mSelect', mSelect: (input.options ?? []).map((option) => ({ content: option, color: '' })) };
        case 'relation':
            return { ...base, type: 'relation', relation: { blockIDs: input.relationBlockIDs ?? [], contents: [] } };
        case 'url':
            return { ...base, type: 'url', url: { content: input.url } };
        case 'email':
            return { ...base, type: 'email', email: { content: input.email } };
        case 'phone':
            return { ...base, type: 'phone', phone: { content: input.phone } };
        default:
            throw new Error(`Unsupported AV valueType: ${(input as { valueType: string }).valueType}`);
    }
}

async function handleGet({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvGetSchema.parse(rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    return createJsonResult({ id: parsed.id, av: avData });
}

async function handleSearch({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvSearchSchema.parse(rawArgs);
    const response = await avApi.searchAttributeView(client, parsed.keyword, parsed.excludes);
    const filtered = await filterAvSearchResultsByPermission(client, permMgr, response.results ?? []);
    return createJsonResult({
        keyword: parsed.keyword,
        ...filtered,
        ...(filtered.filteredOutCount > 0 ? {
            emptyReason: filtered.results.length === 0
                ? (filtered.unresolvedCount > 0 && filtered.permissionFilteredOutCount === 0 ? 'no_verified_results_unresolved_candidates_available'
                    : filtered.permissionFilteredOutCount > 0 && filtered.unresolvedCount === 0 ? 'all_results_permission_filtered'
                        : 'all_results_filtered')
                : undefined,
            unresolvedHint: filtered.unresolvedResults.length > 0
                ? 'unresolvedResults contains kernel search candidates that matched, but MCP could not verify notebook context yet.'
                : undefined,
        } : {}),
    });
}

async function handleAddRows({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvAddRowsSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    if (parsed.blockIDs.length === 0) {
        return createWriteSuccessResult({
            action: 'add_rows',
            avID: parsed.avID,
            blockIDs: [],
            rows: [],
            added: 0,
            skipped: true,
            message: 'No blockIDs were provided, so no rows were added.',
        });
    }

    await avApi.addAttributeViewBlocks(client, {
        avID: parsed.avID,
        blockID: parsed.blockID,
        viewID: parsed.viewID,
        groupID: parsed.groupID,
        previousID: parsed.previousID,
        ignoreDefaultFill: parsed.ignoreDefaultFill,
        srcs: parsed.blockIDs.map((id) => ({ id, isDetached: false })),
    });

    const refreshed = await avApi.getAttributeView(client, parsed.avID);
    const rowLookup = extractAvRowLookup(refreshed.av);
    const rows = parsed.blockIDs.map((blockID) => {
        const matchedRowIDs = rowLookup.sourceToRowIDs.get(blockID) ?? [];
        if (matchedRowIDs.length === 1) {
            return { blockID, rowID: matchedRowIDs[0] };
        }
        if (matchedRowIDs.length > 1) {
            return { blockID, rowIDs: matchedRowIDs };
        }
        return { blockID };
    });
    const unresolvedBlockIDs = rows
        .filter((row) => !('rowID' in row))
        .map((row) => row.blockID);

    return createWriteSuccessResult({
        action: 'add_rows',
        avID: parsed.avID,
        blockIDs: parsed.blockIDs,
        rows,
        added: parsed.blockIDs.length,
        ...(unresolvedBlockIDs.length > 0 ? {
            unresolvedBlockIDs,
            partial: true,
            hint: 'Some new rows could not be mapped back to row item IDs from the refreshed AV payload. Re-read the AV before calling set_cell.',
        } : {}),
    });
}

async function handleRemoveRows({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvRemoveRowsSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    await avApi.removeAttributeViewBlocks(client, parsed.avID, parsed.srcIDs);
    return createWriteSuccessResult({
        action: 'remove_rows',
        avID: parsed.avID,
        srcIDs: parsed.srcIDs,
        removed: parsed.srcIDs.length,
    });
}

async function handleAddColumn({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvAddColumnSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    const keyID = parsed.keyID ?? generateSiYuanNodeId();
    await avApi.addAttributeViewKey(client, {
        ...parsed,
        keyID,
    });
    return createWriteSuccessResult({
        action: 'add_column',
        avID: parsed.avID,
        keyID,
        keyName: parsed.keyName,
        keyType: parsed.keyType,
    });
}

async function handleRemoveColumn({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvRemoveColumnSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;
    const keyID = parsed.keyID ?? parsed.columnID!;

    await avApi.removeAttributeViewKey(client, parsed.avID, keyID, parsed.removeRelationDest);
    return createWriteSuccessResult({
        action: 'remove_column',
        avID: parsed.avID,
        keyID,
        removeRelationDest: parsed.removeRelationDest ?? false,
    });
}

async function handleSetCell({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvSetCellSchema.parse(rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;
    const validatedRowID = validateRowIdForAv(parsed.avID, 'set_cell', extractAvRowLookup(avData), parsed.rowID);
    if (!validatedRowID.ok) return validatedRowID.result;

    const value = buildStrongCellValue(parsed.columnID, validatedRowID.rowID, parsed);
    const response = await avApi.setAttributeViewBlockAttr(client, {
        avID: parsed.avID,
        keyID: parsed.columnID,
        itemID: validatedRowID.rowID,
        value,
    });

    return createWriteSuccessResult({
        action: 'set_cell',
        avID: parsed.avID,
        rowID: parsed.rowID,
        columnID: parsed.columnID,
        valueType: parsed.valueType,
    }, response);
}

async function handleBatchSetCells({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvBatchSetCellsSchema.parse(rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;
    const rowLookup = extractAvRowLookup(avData);

    const values = [];
    for (let index = 0; index < parsed.items.length; index += 1) {
        const item = parsed.items[index];
        const validatedRowID = validateRowIdForAv(parsed.avID, 'batch_set_cells', rowLookup, item.rowID, index);
        if (!validatedRowID.ok) return validatedRowID.result;
        values.push(buildStrongCellValue(item.columnID, validatedRowID.rowID, item));
    }
    await avApi.batchSetAttributeViewBlockAttrs(client, parsed.avID, values);

    return createWriteSuccessResult({
        action: 'batch_set_cells',
        avID: parsed.avID,
        updated: parsed.items.length,
    });
}

async function handleDuplicateBlock({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvDuplicateBlockSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    const response = await avApi.duplicateAttributeViewBlock(client, parsed.avID);
    try {
        await validateDuplicatedAvResult(client, permMgr, parsed.avID, response);
    } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        const verification = (normalized as Error & { verification?: DuplicateVerificationResult }).verification
            ?? { duplicatedBlockExists: false, duplicatedAvReadable: false };
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        type: 'internal_error',
                        tool: AV_TOOL_NAME,
                        action: 'duplicate_block',
                        message: normalized.message,
                        reason: 'duplicate_verification_failed',
                        sourceAvID: parsed.avID,
                        duplicatedAvID: response.avID,
                        duplicatedBlockID: response.blockID,
                        verification,
                        hint: 'The kernel reported success, but MCP could not verify the duplicated AV/block. Treat this as a failed duplication and retry only after checking the source database state.',
                    },
                }, null, 2),
            }],
            isError: true,
        };
    }
    return createWriteSuccessResult({
        action: 'duplicate_block',
        sourceAvID: parsed.avID,
        verified: true,
    }, response);
}

async function handleGetPrimaryKeyValues({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvGetPrimaryKeyValuesSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'read');
    if (denied) return denied;

    const response = await avApi.getAttributeViewPrimaryKeyValues(client, {
        id: parsed.avID,
        keyword: parsed.keyword,
        page: parsed.page,
        pageSize: parsed.pageSize,
    });

    const blockIDs = response.blockIDs ?? [];
    if (blockIDs.length > 0) {
        const cache = createResultResolutionCache();
        await permMgr.reload();
        const filteredBlockIDs: string[] = [];
        const filteredRows: unknown[] = [];
        let filteredOutCount = 0;
        for (let index = 0; index < blockIDs.length; index += 1) {
            const blockID = blockIDs[index];
            const context = await resolveResultItemContext(client, { id: blockID }, cache)
                ?? await resolveDocumentContextById(client, blockID).catch(() => null);
            const notebook = context && 'notebook' in context ? context.notebook : undefined;
            if (!notebook || !permMgr.canRead(notebook)) {
                filteredOutCount += 1;
                continue;
            }
            filteredBlockIDs.push(blockID);
            filteredRows.push(response.rows[index]);
        }

        return createJsonResult({
            avID: parsed.avID,
            name: response.name,
            blockIDs: filteredBlockIDs,
            rows: filteredRows,
            ...(filteredOutCount > 0 ? { filteredOutCount, partial: true, reason: 'permission_filtered' } : {}),
        });
    }

    return createJsonResult({
        avID: parsed.avID,
        ...response,
    });
}

const AV_ACTION_HANDLERS: Record<AvAction, (context: AvHandlerContext) => Promise<ToolResult>> = {
    get: handleGet,
    search: handleSearch,
    add_rows: handleAddRows,
    remove_rows: handleRemoveRows,
    add_column: handleAddColumn,
    remove_column: handleRemoveColumn,
    set_cell: handleSetCell,
    batch_set_cells: handleBatchSetCells,
    duplicate_block: handleDuplicateBlock,
    get_primary_key_values: handleGetPrimaryKeyValues,
};

export async function callAvTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<AvAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(AV_TOOL_NAME, rawArgs, config, AV_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = AvActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(AV_TOOL_NAME, parsedAction);
        }

        const handler = AV_ACTION_HANDLERS[parsedAction];
        return await handler({ client, permMgr, rawArgs });
    } catch (error) {
        return createErrorResult(error, { tool: AV_TOOL_NAME, action, rawArgs });
    }
}
