import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callAvTool } from '@/mcp/tools/av';
import type { ToolResult } from '@/mcp/tools/shared';

vi.mock('@/mcp/tools/context', () => ({
    ensurePermissionForDocumentId: vi.fn(async () => ({
        context: { documentId: 'doc-1', notebook: 'nb-1', path: '/doc-1.sy' },
        denied: null,
    })),
    resolveDocumentContextById: vi.fn(async () => ({
        documentId: 'doc-1',
        notebook: 'nb-1',
        path: '/doc-1.sy',
    })),
    resolveResultItemContext: vi.fn(),
    createResultResolutionCache: vi.fn(() => ({ documentContextById: new Map(), notebookByPath: new Map() })),
}));

vi.mock('@/api/av', () => ({
    getAttributeView: vi.fn(),
    searchAttributeView: vi.fn(),
    addAttributeViewBlocks: vi.fn(),
    removeAttributeViewBlocks: vi.fn(),
    addAttributeViewKey: vi.fn(),
    removeAttributeViewKey: vi.fn(),
    setAttributeViewBlockAttr: vi.fn(),
    batchSetAttributeViewBlockAttrs: vi.fn(),
    duplicateAttributeViewBlock: vi.fn(),
    getMirrorDatabaseBlocks: vi.fn(),
    getAttributeViewPrimaryKeyValues: vi.fn(),
}));

vi.mock('@/api/block', () => ({
    checkBlockExist: vi.fn(),
}));

describe('av tool', () => {
    const enabledActions = <T extends string>(...actions: T[]) => ({
        enabled: true,
        actions: Object.fromEntries(actions.map((action) => [action, true])) as Record<T, boolean>,
    });

    const client = {} as any;
    const permMgr = {
        reload: vi.fn(async () => undefined),
        canRead: vi.fn(() => true),
    } as any;

    beforeEach(async () => {
        const avApi = await import('@/api/av');
        const context = await import('@/mcp/tools/context');
        const blockApi = await import('@/api/block');

        vi.mocked(avApi.getAttributeView).mockReset();
        vi.mocked(avApi.searchAttributeView).mockReset();
        vi.mocked(avApi.addAttributeViewBlocks).mockReset();
        vi.mocked(avApi.batchSetAttributeViewBlockAttrs).mockReset();
        vi.mocked(avApi.setAttributeViewBlockAttr).mockReset();
        vi.mocked(avApi.getMirrorDatabaseBlocks).mockReset();
        vi.mocked(avApi.duplicateAttributeViewBlock).mockReset();
        vi.mocked(context.resolveResultItemContext).mockReset();
        vi.mocked(blockApi.checkBlockExist).mockReset();
        vi.mocked(avApi.getMirrorDatabaseBlocks).mockResolvedValue({ refDefs: [] });
        vi.mocked(blockApi.checkBlockExist).mockResolvedValue(true);

        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-1',
                keyValues: [
                    {
                        key: { type: 'block' },
                        values: [{ blockID: 'block-1' }],
                    },
                ],
            },
        });
    });

    it('maps typed set_cell input into the kernel value payload', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-1',
                keyValues: [
                    {
                        key: { type: 'block' },
                        values: [{ id: 'row-1', blockID: 'block-1' }],
                    },
                ],
            },
        });
        vi.mocked(avApi.setAttributeViewBlockAttr).mockResolvedValue({
            value: { type: 'number' },
        });

        const result = await callAvTool(client, {
            action: 'set_cell',
            avID: 'av-1',
            rowID: 'row-1',
            columnID: 'col-1',
            valueType: 'number',
            number: 12.5,
            numberFormat: 'CNY',
        }, enabledActions('set_cell'), permMgr);

        expect(vi.mocked(avApi.setAttributeViewBlockAttr)).toHaveBeenCalledWith(client, {
            avID: 'av-1',
            keyID: 'col-1',
            itemID: 'row-1',
            value: {
                keyID: 'col-1',
                blockID: 'row-1',
                type: 'number',
                number: {
                    content: 12.5,
                    isNotEmpty: true,
                    format: 'CNY',
                    formattedContent: '',
                },
            },
        });

        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            value: { type: 'number' },
            action: 'set_cell',
            avID: 'av-1',
            rowID: 'row-1',
            columnID: 'col-1',
            valueType: 'number',
        });
    });

    it('rejects set_cell when rowID is a source block ID and suggests the row item ID', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-1',
                keyValues: [
                    {
                        key: { type: 'block' },
                        values: [{ id: 'row-actual', blockID: 'block-source' }],
                    },
                ],
            },
        });

        const result = await callAvTool(client, {
            action: 'set_cell',
            avID: 'av-1',
            rowID: 'block-source',
            columnID: 'col-1',
            valueType: 'text',
            text: '备注',
        }, enabledActions('set_cell'), permMgr);

        expect(vi.mocked(avApi.setAttributeViewBlockAttr)).not.toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toEqual({
            error: {
                type: 'validation_error',
                tool: 'av',
                action: 'set_cell',
                reason: 'row_id_required',
                message: 'rowID "block-source" is a source block ID in attribute view "av-1". Use the row item ID instead.',
                avID: 'av-1',
                rowID: 'block-source',
                detectedSourceBlockID: 'block-source',
                suggestedRowID: 'row-actual',
                hint: 'Use the rowID returned by av(action="add_rows"), or read the database again and map source blockID -> row item ID before calling set_cell/batch_set_cells.',
            },
        });
    });

    it('returns the AV payload for get', async () => {
        const result = await callAvTool(client, {
            action: 'get',
            id: 'av-1',
        }, enabledActions('get'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'av-1',
            av: {
                id: 'av-1',
                keyValues: [
                    {
                        key: { type: 'block' },
                        values: [{ blockID: 'block-1' }],
                    },
                ],
            },
        });
    });

    it('filters unreadable AV search results', async () => {
        const avApi = await import('@/api/av');
        const context = await import('@/mcp/tools/context');

        vi.mocked(avApi.searchAttributeView).mockResolvedValue({
            results: [{ id: 'av-a' }, { id: 'av-b' }],
        });
        vi.mocked(context.resolveResultItemContext)
            .mockResolvedValueOnce({ notebook: 'allowed', path: '/a.sy', documentId: 'doc-a' })
            .mockResolvedValueOnce({ notebook: 'blocked', path: '/b.sy', documentId: 'doc-b' });
        permMgr.canRead = vi.fn((notebook: string) => notebook !== 'blocked');

        const result = await callAvTool(client, {
            action: 'search',
            keyword: 'crm',
        }, enabledActions('search'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            keyword: 'crm',
            results: [{ id: 'av-a' }],
            unresolvedResults: [],
            rawResultCount: 2,
            filteredOutCount: 1,
            unresolvedCount: 0,
            permissionFilteredOutCount: 1,
            partial: true,
            reason: 'permission_filtered',
        });
    });

    it('reports unresolved AV search results separately from permission filtering', async () => {
        const avApi = await import('@/api/av');
        const context = await import('@/mcp/tools/context');

        vi.mocked(avApi.searchAttributeView).mockResolvedValue({
            results: [{ id: 'av-a' }],
        });
        vi.mocked(context.resolveResultItemContext).mockResolvedValue(null);

        const result = await callAvTool(client, {
            action: 'search',
            keyword: '账本',
        }, enabledActions('search'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            keyword: '账本',
            results: [],
            unresolvedResults: [{ id: 'av-a' }],
            rawResultCount: 1,
            filteredOutCount: 1,
            unresolvedCount: 1,
            permissionFilteredOutCount: 0,
            partial: true,
            reason: 'context_unresolved',
            emptyReason: 'no_verified_results_unresolved_candidates_available',
            unresolvedHint: 'unresolvedResults contains kernel search candidates that matched, but MCP could not verify notebook context yet.',
        });
    });

    it('falls back to database block refs when an AV has no rows yet', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-empty',
                keyValues: [
                    {
                        key: { type: 'block' },
                        values: [],
                    },
                ],
            },
        });
        vi.mocked(avApi.getMirrorDatabaseBlocks).mockResolvedValue({
            refDefs: [{ refID: 'db-block-1' }],
        });
        vi.mocked(avApi.addAttributeViewKey).mockResolvedValue(null);

        const result = await callAvTool(client, {
            action: 'add_column',
            avID: 'av-empty',
            keyID: 'col-1',
            keyName: '备注',
            keyType: 'text',
        }, enabledActions('add_column'), permMgr);

        expect(vi.mocked(avApi.addAttributeViewKey)).toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            action: 'add_column',
            avID: 'av-empty',
            keyID: 'col-1',
            keyName: '备注',
            keyType: 'text',
        });
    });

    it('auto-generates keyID for add_column when omitted', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.addAttributeViewKey).mockResolvedValue(null);

        const result = await callAvTool(client, {
            action: 'add_column',
            avID: 'av-1',
            keyName: '日期',
            keyType: 'date',
        }, enabledActions('add_column'), permMgr);

        expect(vi.mocked(avApi.addAttributeViewKey)).toHaveBeenCalledWith(
            client,
            expect.objectContaining({
                avID: 'av-1',
                keyName: '日期',
                keyType: 'date',
                keyID: expect.stringMatching(/^\d{14}-[a-z0-9]{7}$/),
            }),
        );

        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            action: 'add_column',
            avID: 'av-1',
            keyID: expect.stringMatching(/^\d{14}-[a-z0-9]{7}$/),
            keyName: '日期',
            keyType: 'date',
        });
    });

    it('accepts columnID as an alias in remove_column', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.removeAttributeViewKey).mockResolvedValue(null);

        const result = await callAvTool(client, {
            action: 'remove_column',
            avID: 'av-1',
            columnID: 'col-alias-1',
        }, enabledActions('remove_column'), permMgr);

        expect(vi.mocked(avApi.removeAttributeViewKey)).toHaveBeenCalledWith(
            client,
            'av-1',
            'col-alias-1',
            undefined,
        );
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            action: 'remove_column',
            avID: 'av-1',
            keyID: 'col-alias-1',
            removeRelationDest: false,
        });
    });

    it('treats add_rows with an empty blockIDs list as a no-op success', async () => {
        const avApi = await import('@/api/av');

        const result = await callAvTool(client, {
            action: 'add_rows',
            avID: 'av-1',
            blockIDs: [],
        }, enabledActions('add_rows'), permMgr);

        expect(vi.mocked(avApi.addAttributeViewBlocks)).not.toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            action: 'add_rows',
            avID: 'av-1',
            blockIDs: [],
            rows: [],
            added: 0,
            skipped: true,
            message: 'No blockIDs were provided, so no rows were added.',
        });
    });

    it('adds rows when blockIDs are provided', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.getAttributeView)
            .mockResolvedValueOnce({
                av: {
                    id: 'av-1',
                    keyValues: [
                        {
                            key: { type: 'block' },
                            values: [{ id: 'row-existing', blockID: 'block-1' }],
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                av: {
                    id: 'av-1',
                    keyValues: [
                        {
                            key: { type: 'block' },
                            values: [
                                { id: 'row-a', blockID: 'block-a' },
                                { id: 'row-b', blockID: 'block-b' },
                            ],
                        },
                    ],
                },
            });
        vi.mocked(avApi.addAttributeViewBlocks).mockResolvedValue(null);

        const result = await callAvTool(client, {
            action: 'add_rows',
            avID: 'av-1',
            blockIDs: ['block-a', 'block-b'],
            viewID: 'view-1',
        }, enabledActions('add_rows'), permMgr);

        expect(vi.mocked(avApi.addAttributeViewBlocks)).toHaveBeenCalledWith(client, {
            avID: 'av-1',
            blockID: undefined,
            viewID: 'view-1',
            groupID: undefined,
            previousID: undefined,
            ignoreDefaultFill: undefined,
            srcs: [
                { id: 'block-a', isDetached: false },
                { id: 'block-b', isDetached: false },
            ],
        });
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            action: 'add_rows',
            avID: 'av-1',
            blockIDs: ['block-a', 'block-b'],
            rows: [
                { blockID: 'block-a', rowID: 'row-a' },
                { blockID: 'block-b', rowID: 'row-b' },
            ],
            added: 2,
        });
    });

    it('removes rows by srcIDs', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.removeAttributeViewBlocks).mockResolvedValue(null);

        const result = await callAvTool(client, {
            action: 'remove_rows',
            avID: 'av-1',
            srcIDs: ['row-a', 'row-b'],
        }, enabledActions('remove_rows'), permMgr);

        expect(vi.mocked(avApi.removeAttributeViewBlocks)).toHaveBeenCalledWith(
            client,
            'av-1',
            ['row-a', 'row-b'],
        );
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            action: 'remove_rows',
            avID: 'av-1',
            srcIDs: ['row-a', 'row-b'],
            removed: 2,
        });
    });

    it('batch updates typed cells', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-1',
                keyValues: [
                    {
                        key: { type: 'block' },
                        values: [
                            { id: 'row-1', blockID: 'block-1' },
                            { id: 'row-2', blockID: 'block-2' },
                        ],
                    },
                ],
            },
        });
        vi.mocked(avApi.batchSetAttributeViewBlockAttrs).mockResolvedValue(null);

        const result = await callAvTool(client, {
            action: 'batch_set_cells',
            avID: 'av-1',
            items: [
                { rowID: 'row-1', columnID: 'col-text', valueType: 'text', text: '早餐' },
                { rowID: 'row-2', columnID: 'col-check', valueType: 'checkbox', checked: true },
            ],
        }, enabledActions('batch_set_cells'), permMgr);

        expect(vi.mocked(avApi.batchSetAttributeViewBlockAttrs)).toHaveBeenCalledWith(
            client,
            'av-1',
            [
                {
                    keyID: 'col-text',
                    blockID: 'row-1',
                    type: 'text',
                    text: { content: '早餐' },
                },
                {
                    keyID: 'col-check',
                    blockID: 'row-2',
                    type: 'checkbox',
                    checkbox: { checked: true },
                },
            ],
        );
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            action: 'batch_set_cells',
            avID: 'av-1',
            updated: 2,
        });
    });

    it('rejects batch_set_cells when an item uses a source block ID', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-1',
                keyValues: [
                    {
                        key: { type: 'block' },
                        values: [
                            { id: 'row-1', blockID: 'block-1' },
                            { id: 'row-2', blockID: 'block-2' },
                        ],
                    },
                ],
            },
        });

        const result = await callAvTool(client, {
            action: 'batch_set_cells',
            avID: 'av-1',
            items: [
                { rowID: 'row-1', columnID: 'col-text', valueType: 'text', text: '早餐' },
                { rowID: 'block-2', columnID: 'col-check', valueType: 'checkbox', checked: true },
            ],
        }, enabledActions('batch_set_cells'), permMgr);

        expect(vi.mocked(avApi.batchSetAttributeViewBlockAttrs)).not.toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toEqual({
            error: {
                type: 'validation_error',
                tool: 'av',
                action: 'batch_set_cells',
                reason: 'row_id_required',
                message: 'rowID "block-2" is a source block ID in attribute view "av-1". Use the row item ID instead.',
                avID: 'av-1',
                rowID: 'block-2',
                detectedSourceBlockID: 'block-2',
                suggestedRowID: 'row-2',
                itemIndex: 1,
                hint: 'Use the rowID returned by av(action="add_rows"), or read the database again and map source blockID -> row item ID before calling set_cell/batch_set_cells.',
            },
        });
    });

    it('duplicates a database block', async () => {
        const avApi = await import('@/api/av');
        vi.mocked(avApi.duplicateAttributeViewBlock).mockResolvedValue({
            avID: 'av-copy',
            blockID: 'block-copy',
        });
        vi.mocked(avApi.getAttributeView)
            .mockResolvedValueOnce({
                av: {
                    id: 'av-1',
                    keyValues: [
                        {
                            key: { type: 'block' },
                            values: [{ blockID: 'block-1' }],
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                av: {
                    id: 'av-copy',
                    keyValues: [
                        {
                            key: { type: 'block' },
                            values: [{ blockID: 'block-copy' }],
                        },
                    ],
                },
            });

        const result = await callAvTool(client, {
            action: 'duplicate_block',
            avID: 'av-1',
        }, enabledActions('duplicate_block'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            avID: 'av-copy',
            blockID: 'block-copy',
            action: 'duplicate_block',
            sourceAvID: 'av-1',
            verified: true,
        });
    });

    it('fails duplicate_block when the duplicated block cannot be verified', async () => {
        const avApi = await import('@/api/av');
        const blockApi = await import('@/api/block');
        vi.mocked(avApi.duplicateAttributeViewBlock).mockResolvedValue({
            avID: 'av-copy',
            blockID: 'block-copy',
        });
        vi.mocked(blockApi.checkBlockExist).mockResolvedValue(false);

        const result = await callAvTool(client, {
            action: 'duplicate_block',
            avID: 'av-1',
        }, enabledActions('duplicate_block'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            error: {
                type: 'internal_error',
                tool: 'av',
                action: 'duplicate_block',
                message: 'Duplicate AV verification failed: returned block "block-copy" does not exist.',
                reason: 'duplicate_verification_failed',
                sourceAvID: 'av-1',
                duplicatedAvID: 'av-copy',
                duplicatedBlockID: 'block-copy',
                verification: {
                    duplicatedBlockExists: false,
                    duplicatedAvReadable: false,
                },
                hint: 'The kernel reported success, but MCP could not verify the duplicated AV/block. Treat this as a failed duplication and retry only after checking the source database state.',
            },
        });
    });

    it('returns filtered primary key values', async () => {
        const avApi = await import('@/api/av');
        const context = await import('@/mcp/tools/context');
        vi.mocked(avApi.getAttributeViewPrimaryKeyValues).mockResolvedValue({
            name: '记账',
            blockIDs: ['block-a', 'block-b'],
            rows: [{ id: 'row-a' }, { id: 'row-b' }],
        });
        vi.mocked(context.resolveResultItemContext).mockImplementation(async (_client, item) => {
            const id = item && typeof item === 'object' && 'id' in item ? (item as { id?: string }).id : undefined;
            if (id === 'block-a') {
                return { notebook: 'allowed', path: '/a.sy', documentId: 'doc-a' };
            }
            if (id === 'block-b') {
                return { notebook: 'blocked', path: '/b.sy', documentId: 'doc-b' };
            }
            return { notebook: 'allowed', path: '/av.sy', documentId: 'doc-av' };
        });
        permMgr.canRead = vi.fn((notebook: string) => notebook !== 'blocked');

        const result = await callAvTool(client, {
            action: 'get_primary_key_values',
            avID: 'av-1',
        }, enabledActions('get_primary_key_values'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            avID: 'av-1',
            name: '记账',
            blockIDs: ['block-a'],
            rows: [{ id: 'row-a' }],
            filteredOutCount: 1,
            partial: true,
            reason: 'permission_filtered',
        });
    });

    it('skips stale mirror block refs when resolving AV permissions', async () => {
        const avApi = await import('@/api/av');
        const context = await import('@/mcp/tools/context');

        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-stale',
                keyValues: [{ key: { type: 'block' }, values: [] }],
            },
        });
        vi.mocked(avApi.getMirrorDatabaseBlocks).mockResolvedValue({
            refDefs: [{ refID: 'missing-block' }, { refID: 'good-block' }],
        });
        vi.mocked(context.ensurePermissionForDocumentId)
            .mockRejectedValueOnce(new Error('SiYuan API error: -1 - 未找到 ID 为 [missing-block] 的内容块'))
            .mockResolvedValueOnce({
                context: { documentId: 'doc-good', notebook: 'nb-1', path: '/doc-good.sy' },
                denied: null,
            } as { context: { documentId: string; notebook: string; path: string }; denied: ToolResult | null });

        const result = await callAvTool(client, {
            action: 'get',
            id: 'av-stale',
        }, enabledActions('get'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'av-stale',
            av: {
                id: 'av-stale',
                keyValues: [{ key: { type: 'block' }, values: [] }],
            },
        });
    });

    it('skips a stale first-row block and falls back to mirror refs', async () => {
        const avApi = await import('@/api/av');
        const context = await import('@/mcp/tools/context');

        vi.mocked(avApi.getAttributeView).mockResolvedValue({
            av: {
                id: 'av-row-stale',
                keyValues: [{ key: { type: 'block' }, values: [{ blockID: 'missing-row-block' }] }],
            },
        });
        vi.mocked(avApi.getMirrorDatabaseBlocks).mockResolvedValue({
            refDefs: [{ refID: 'good-block' }],
        });
        vi.mocked(context.ensurePermissionForDocumentId)
            .mockRejectedValueOnce(new Error('SiYuan API error: -1 - 未找到 ID 为 [missing-row-block] 的内容块'))
            .mockResolvedValueOnce({
                context: { documentId: 'doc-good', notebook: 'nb-1', path: '/doc-good.sy' },
                denied: null,
            } as { context: { documentId: string; notebook: string; path: string }; denied: ToolResult | null });

        const result = await callAvTool(client, {
            action: 'get',
            id: 'av-row-stale',
        }, enabledActions('get'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'av-row-stale',
            av: {
                id: 'av-row-stale',
                keyValues: [{ key: { type: 'block' }, values: [{ blockID: 'missing-row-block' }] }],
            },
        });
    });
});
