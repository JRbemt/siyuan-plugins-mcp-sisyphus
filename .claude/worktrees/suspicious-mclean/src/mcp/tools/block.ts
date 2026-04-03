import type { SiYuanClient } from '../../api/client';
import * as attributeApi from '../../api/attribute';
import * as blockApi from '../../api/block';
import type { BlockAction, CategoryToolConfig } from '../config';
import { BLOCK_ACTION_HINTS, BLOCK_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    BlockActionSchema,
    BlockAppendSchema,
    BlockBreadcrumbSchema,
    BlockDeleteSchema,
    BlockDomSchema,
    BlockExistsSchema,
    BlockFoldSchema,
    BlockGetAttrsSchema,
    BlockGetChildrenSchema,
    BlockGetKramdownSchema,
    BlockInfoSchema,
    BlockInsertSchema,
    BlockMoveSchema,
    BlockPrependSchema,
    BlockRecentUpdatedSchema,
    BlockSetAttrsSchema,
    BlockTransferRefSchema,
    BlockUnfoldSchema,
    BlockUpdateSchema,
    BlockWordCountSchema,
} from '../types';
import { ensurePermissionForDocumentId } from './context';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, createWriteSuccessResult, type ActionVariant, type ToolResult } from './shared';

export const BLOCK_TOOL_NAME = 'block';

export const BLOCK_VARIANTS: ActionVariant<BlockAction>[] = [
    {
        action: 'insert',
        schema: createActionSchema('insert', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
            nextID: { type: 'string', description: 'Next block ID' },
            previousID: { type: 'string', description: 'Previous block ID' },
            parentID: { type: 'string', description: 'Parent block or document ID' },
        }, ['dataType', 'data'], 'Insert a new block at the specified position.'),
    },
    {
        action: 'prepend',
        schema: createActionSchema('prepend', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
            parentID: { type: 'string', description: 'Parent block or document ID' },
        }, ['dataType', 'data', 'parentID'], 'Insert a block at the beginning of a parent.'),
    },
    {
        action: 'append',
        schema: createActionSchema('append', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
            parentID: { type: 'string', description: 'Parent block or document ID' },
        }, ['dataType', 'data', 'parentID'], 'Insert a block at the end of a parent.'),
    },
    {
        action: 'update',
        schema: createActionSchema('update', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'New block content' },
            id: { type: 'string', description: 'Block ID' },
        }, ['dataType', 'data', 'id'], 'Update block content.'),
    },
    {
        action: 'delete',
        schema: createActionSchema('delete', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Delete a block by ID.'),
    },
    {
        action: 'move',
        schema: createActionSchema('move', {
            id: { type: 'string', description: 'Block ID' },
            previousID: { type: 'string', description: 'Previous block ID' },
            parentID: { type: 'string', description: 'New parent block ID' },
        }, ['id'], 'Move a block to a new position.'),
    },
    {
        action: 'fold',
        schema: createActionSchema('fold', {
            id: { type: 'string', description: 'Foldable block ID' },
        }, ['id'], 'Fold a foldable block.'),
    },
    {
        action: 'unfold',
        schema: createActionSchema('unfold', {
            id: { type: 'string', description: 'Foldable block ID' },
        }, ['id'], 'Unfold a foldable block.'),
    },
    {
        action: 'get_kramdown',
        schema: createActionSchema('get_kramdown', {
            id: { type: 'string', description: 'Block ID or document ID' },
        }, ['id'], 'Get block content in kramdown format.'),
    },
    {
        action: 'get_children',
        schema: createActionSchema('get_children', {
            id: { type: 'string', description: 'Block ID or document ID' },
        }, ['id'], 'Get all child blocks of a parent.'),
    },
    {
        action: 'transfer_ref',
        schema: createActionSchema('transfer_ref', {
            fromID: { type: 'string', description: 'Source block ID' },
            toID: { type: 'string', description: 'Target block ID' },
            refIDs: { type: 'array', items: { type: 'string' }, description: 'Reference block IDs' },
        }, ['fromID', 'toID'], 'Transfer block references from one block to another.'),
    },
    {
        action: 'set_attrs',
        schema: createActionSchema('set_attrs', {
            id: { type: 'string', description: 'Block ID' },
            attrs: {
                type: 'object',
                description: 'Block attributes',
                additionalProperties: { type: 'string' },
            },
        }, ['id', 'attrs'], 'Set block attributes.'),
    },
    {
        action: 'get_attrs',
        schema: createActionSchema('get_attrs', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Get block attributes.'),
    },
    {
        action: 'exists',
        schema: createActionSchema('exists', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Check whether a block exists.'),
    },
    {
        action: 'info',
        schema: createActionSchema('info', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Get block position and root document metadata.'),
    },
    {
        action: 'breadcrumb',
        schema: createActionSchema('breadcrumb', {
            id: { type: 'string', description: 'Block ID' },
            excludeTypes: { type: 'array', items: { type: 'string' }, description: 'Optional block types to exclude' },
        }, ['id'], 'Get the breadcrumb path for a block.'),
    },
    {
        action: 'dom',
        schema: createActionSchema('dom', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Get rendered DOM for a block.'),
    },
    {
        action: 'recent_updated',
        schema: createActionSchema('recent_updated', {
            count: { type: 'number', description: 'Maximum number of recent blocks to return' },
        }, [], 'Get recently updated blocks.'),
    },
    {
        action: 'word_count',
        schema: createActionSchema('word_count', {
            ids: { type: 'array', items: { type: 'string' }, description: 'One or more block IDs' },
        }, ['ids'], 'Get word-count statistics for blocks.'),
    },
];

export function listBlockTools(config: CategoryToolConfig<BlockAction>) {
    return buildAggregatedTool(
        BLOCK_TOOL_NAME,
        '🧱 Grouped block operations.',
        config,
        BLOCK_VARIANTS,
        {
            guidance: BLOCK_GUIDANCE,
            actionHints: BLOCK_ACTION_HINTS,
            propertyDescriptionOverrides: {
                parentID: 'Parent block or document ID. With prepend/append, a document ID targets the document head or tail; a block ID targets that block\'s child list.',
                previousID: 'Sibling block ID to position after. For block(action="move"), provide previousID, parentID, or both to describe the destination. Successful moves return a structured success object.',
            },
        },
    );
}

function createSlimWriteResult(
    rawResult: unknown,
    context: {
        action: 'insert' | 'prepend' | 'append';
        dataType: string;
        parentID?: string;
        previousID?: string;
        nextID?: string;
    },
): ToolResult {
    const operationBatch = Array.isArray(rawResult) ? rawResult[0] : rawResult;
    const firstOperation = operationBatch && typeof operationBatch === 'object' && Array.isArray((operationBatch as { doOperations?: unknown[] }).doOperations)
        ? (operationBatch as { doOperations: Array<Record<string, unknown>> }).doOperations[0]
        : undefined;

    const id = typeof firstOperation?.id === 'string' ? firstOperation.id : undefined;
    const parentID = typeof firstOperation?.parentID === 'string' ? firstOperation.parentID : context.parentID;
    const previousID = typeof firstOperation?.previousID === 'string' ? firstOperation.previousID : context.previousID;
    const nextID = typeof firstOperation?.nextID === 'string' ? firstOperation.nextID : context.nextID;

    return createWriteSuccessResult({
        action: context.action,
        ...(id ? { id } : {}),
        ...(parentID ? { parentID } : {}),
        ...(previousID ? { previousID } : {}),
        ...(nextID ? { nextID } : {}),
        dataType: context.dataType,
    });
}

export async function callBlockTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<BlockAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    try {
        const parsedAction = BlockActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(BLOCK_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'insert': {
                const parsed = BlockInsertSchema.parse(rawArgs);
                const refId = parsed.nextID || parsed.previousID || parsed.parentID;
                if (refId) {
                    const { denied } = await ensurePermissionForDocumentId(client, permMgr, refId, 'write');
                    if (denied) {
                        return denied;
                    }
                }
                const result = await blockApi.insertBlock(client, parsed.dataType, parsed.data, parsed.nextID, parsed.previousID, parsed.parentID);
                return createSlimWriteResult(result, {
                    action: 'insert',
                    dataType: parsed.dataType,
                    parentID: parsed.parentID,
                    previousID: parsed.previousID,
                    nextID: parsed.nextID,
                });
            }
            case 'prepend': {
                const parsed = BlockPrependSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.parentID, 'write');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.prependBlock(client, parsed.dataType, parsed.data, parsed.parentID);
                return createSlimWriteResult(result, {
                    action: 'prepend',
                    dataType: parsed.dataType,
                    parentID: parsed.parentID,
                });
            }
            case 'append': {
                const parsed = BlockAppendSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.parentID, 'write');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.appendBlock(client, parsed.dataType, parsed.data, parsed.parentID);
                return createSlimWriteResult(result, {
                    action: 'append',
                    dataType: parsed.dataType,
                    parentID: parsed.parentID,
                });
            }
            case 'update': {
                const parsed = BlockUpdateSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.updateBlock(client, parsed.dataType, parsed.data, parsed.id);
                return createJsonResult(result);
            }
            case 'delete': {
                const parsed = BlockDeleteSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'delete');
                if (denied) {
                    return denied;
                }
                await blockApi.deleteBlock(client, parsed.id);
                return createJsonResult({ success: true, id: parsed.id });
            }
            case 'move': {
                const parsed = BlockMoveSchema.parse(rawArgs);
                const source = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                if (source.denied) {
                    return source.denied;
                }
                if (parsed.parentID) {
                    const destination = await ensurePermissionForDocumentId(client, permMgr, parsed.parentID, 'write');
                    if (destination.denied) {
                        return destination.denied;
                    }
                }
                if (parsed.previousID) {
                    const sibling = await ensurePermissionForDocumentId(client, permMgr, parsed.previousID, 'write');
                    if (sibling.denied) {
                        return sibling.denied;
                    }
                }
                const result = await blockApi.moveBlock(client, parsed.id, parsed.previousID, parsed.parentID);
                return createWriteSuccessResult({
                    id: parsed.id,
                    ...(parsed.previousID ? { previousID: parsed.previousID } : {}),
                    ...(parsed.parentID ? { parentID: parsed.parentID } : {}),
                }, result);
            }
            case 'fold': {
                const parsed = BlockFoldSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                if (denied) {
                    return denied;
                }
                await blockApi.foldBlock(client, parsed.id);
                return createJsonResult({ success: true, id: parsed.id });
            }
            case 'unfold': {
                const parsed = BlockUnfoldSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                if (denied) {
                    return denied;
                }
                await blockApi.unfoldBlock(client, parsed.id);
                return createJsonResult({ success: true, id: parsed.id });
            }
            case 'get_kramdown': {
                const parsed = BlockGetKramdownSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.getBlockKramdown(client, parsed.id);
                return createJsonResult(result);
            }
            case 'get_children': {
                const parsed = BlockGetChildrenSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.getChildBlocks(client, parsed.id);
                return createJsonResult(result);
            }
            case 'transfer_ref': {
                const parsed = BlockTransferRefSchema.parse(rawArgs);
                const source = await ensurePermissionForDocumentId(client, permMgr, parsed.fromID, 'write');
                if (source.denied) {
                    return source.denied;
                }
                const target = await ensurePermissionForDocumentId(client, permMgr, parsed.toID, 'write');
                if (target.denied) {
                    return target.denied;
                }
                await blockApi.transferBlockRef(client, parsed.fromID, parsed.toID, parsed.refIDs);
                return createJsonResult({ success: true, fromID: parsed.fromID, toID: parsed.toID });
            }
            case 'set_attrs': {
                const parsed = BlockSetAttrsSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                if (denied) {
                    return denied;
                }
                await attributeApi.setBlockAttrs(client, parsed.id, parsed.attrs);
                return createJsonResult({ success: true, id: parsed.id, attrs: parsed.attrs });
            }
            case 'get_attrs': {
                const parsed = BlockGetAttrsSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await attributeApi.getBlockAttrs(client, parsed.id);
                return createJsonResult(result);
            }
            case 'exists': {
                const parsed = BlockExistsSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const exists = await blockApi.checkBlockExist(client, parsed.id);
                return createJsonResult({ id: parsed.id, exists });
            }
            case 'info': {
                const parsed = BlockInfoSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.getBlockInfo(client, parsed.id);
                return createJsonResult(result);
            }
            case 'breadcrumb': {
                const parsed = BlockBreadcrumbSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.getBlockBreadcrumb(client, parsed.id, parsed.excludeTypes);
                return createJsonResult(result);
            }
            case 'dom': {
                const parsed = BlockDomSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.getBlockDOM(client, parsed.id);
                return createJsonResult(result);
            }
            case 'recent_updated': {
                BlockRecentUpdatedSchema.parse(rawArgs);
                const result = await blockApi.getRecentUpdatedBlocks(client);
                return createJsonResult(result);
            }
            case 'word_count': {
                const parsed = BlockWordCountSchema.parse(rawArgs);
                for (const id of parsed.ids) {
                    const { denied } = await ensurePermissionForDocumentId(client, permMgr, id, 'read');
                    if (denied) {
                        return denied;
                    }
                }
                const result = await blockApi.getBlocksWordCount(client, parsed.ids);
                return createJsonResult(result);
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: BLOCK_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: BLOCK_TOOL_NAME, action, rawArgs });
    }
}
