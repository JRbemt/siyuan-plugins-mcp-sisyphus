import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callBlockTool } from '@/mcp/tools/block';
import { callDocumentTool } from '@/mcp/tools/document';
import { callFileTool } from '@/mcp/tools/file';
import { callSearchTool } from '@/mcp/tools/search';

vi.mock('@/mcp/tools/context', () => ({
    ensurePermissionForDocumentId: vi.fn(async () => ({
        context: { documentId: 'doc-1', notebook: 'nb-1', path: '/doc-1.sy' },
        denied: null,
    })),
    ensurePermissionForNotebook: vi.fn(async () => null),
    listChildDocumentsByPath: vi.fn(),
    resolveMoveTargetNotebook: vi.fn(),
    resolveNotebookForPath: vi.fn(),
}));

vi.mock('@/api/file', () => ({
    exportMdContent: vi.fn(),
}));

vi.mock('@/api/document', () => ({
    getDoc: vi.fn(),
}));

vi.mock('@/api/block', () => ({
    updateBlock: vi.fn(),
    getBlockKramdown: vi.fn(),
    getChildBlocks: vi.fn(),
}));

vi.mock('@/api/search', () => ({
    fullTextSearchBlock: vi.fn(),
    getBacklinkDoc: vi.fn(),
    getBackmentionDoc: vi.fn(),
    querySQL: vi.fn(),
    searchTag: vi.fn(),
}));

describe('tool result normalization', () => {
    const enabledActions = <T extends string>(...actions: T[]) => ({
        enabled: true,
        actions: Object.fromEntries(actions.map((action) => [action, true])) as Record<T, boolean>,
    });

    const permMgr = {} as any;
    const client = {} as any;

    beforeEach(async () => {
        const fileApi = await import('@/api/file');
        const documentApi = await import('@/api/document');
        const blockApi = await import('@/api/block');
        const searchApi = await import('@/api/search');

        vi.mocked(fileApi.exportMdContent).mockReset();
        vi.mocked(documentApi.getDoc).mockReset();
        vi.mocked(blockApi.updateBlock).mockReset();
        vi.mocked(blockApi.getBlockKramdown).mockReset();
        vi.mocked(blockApi.getChildBlocks).mockReset();
        vi.mocked(searchApi.fullTextSearchBlock).mockReset();
    });

    it('returns clean markdown for document.get_doc markdown mode', async () => {
        const fileApi = await import('@/api/file');
        vi.mocked(fileApi.exportMdContent).mockResolvedValue({
            hPath: '/Doc',
            content: 'hello\u200B #tag#\u200B',
        });

        const result = await callDocumentTool(client, {
            action: 'get_doc',
            id: 'doc-1',
            mode: 'markdown',
        }, enabledActions('get_doc'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'doc-1',
            mode: 'markdown',
            hPath: '/Doc',
            content: 'hello #tag#',
        });
    });

    it('keeps html mode routed through document.getDoc', async () => {
        const documentApi = await import('@/api/document');
        vi.mocked(documentApi.getDoc).mockResolvedValue({
            content: '<div>doc</div>',
            extra: 'value',
        });

        const result = await callDocumentTool(client, {
            action: 'get_doc',
            id: 'doc-1',
            mode: 'html',
        }, enabledActions('get_doc'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'doc-1',
            mode: 'html',
            content: '<div>doc</div>',
            extra: 'value',
        });
    });

    it('paginates markdown content for document.get_doc', async () => {
        const fileApi = await import('@/api/file');
        vi.mocked(fileApi.exportMdContent).mockResolvedValue({
            hPath: '/Doc',
            content: 'abcdefghij',
        });

        const result = await callDocumentTool(client, {
            action: 'get_doc',
            id: 'doc-1',
            mode: 'markdown',
            page: 2,
            pageSize: 4,
        }, enabledActions('get_doc'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'doc-1',
            mode: 'markdown',
            hPath: '/Doc',
            content: 'efgh',
            truncated: true,
            contentLength: 10,
            showing: 4,
            page: 2,
            pageSize: 4,
            pageCount: 3,
            hasNextPage: true,
            hint: 'Use page/pageSize to read the next markdown chunk. For structured reads, use document(action="get_child_blocks") or block(action="get_kramdown").',
        });
    });

    it('returns slim payload for block.update', async () => {
        const blockApi = await import('@/api/block');
        vi.mocked(blockApi.updateBlock).mockResolvedValue({
            doOperations: [{ id: 'block-1' }],
            undoOperations: null,
        } as any);

        const result = await callBlockTool(client, {
            action: 'update',
            id: 'block-1',
            dataType: 'markdown',
            data: 'updated\u200B text',
        }, enabledActions('update'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            id: 'block-1',
            dataType: 'markdown',
            markdown: 'updated text',
        });
    });

    it('cleans zero-width chars for file.export_md and block.get_kramdown', async () => {
        const fileApi = await import('@/api/file');
        const blockApi = await import('@/api/block');
        vi.mocked(fileApi.exportMdContent).mockResolvedValue({
            hPath: '/Doc',
            content: '\u200B#tag#\u200B',
        });
        vi.mocked(blockApi.getBlockKramdown).mockResolvedValue({
            id: 'block-1',
            kramdown: '\u200B#tag#\u200B',
        } as any);

        const exportResult = await callFileTool(client, {
            action: 'export_md',
            id: 'doc-1',
        }, enabledActions('export_md'), permMgr);
        const kramdownResult = await callBlockTool(client, {
            action: 'get_kramdown',
            id: 'block-1',
        }, enabledActions('get_kramdown'), permMgr);

        expect(JSON.parse(exportResult.content[0].text).content).toBe('#tag#');
        expect(JSON.parse(kramdownResult.content[0].text).kramdown).toBe('#tag#');
    });

    it('adds plainContent when search.fulltext stripHtml is enabled', async () => {
        const searchApi = await import('@/api/search');
        vi.mocked(searchApi.fullTextSearchBlock).mockResolvedValue({
            blocks: [{ id: 'b1', content: 'before <mark>hit</mark> after' }],
            matchedBlockCount: 1,
            matchedRootCount: 1,
            pageCount: 1,
        });

        const result = await callSearchTool(client, {
            action: 'fulltext',
            query: 'hit',
            stripHtml: true,
        }, enabledActions('fulltext'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            blocks: [{ id: 'b1', content: 'before <mark>hit</mark> after', plainContent: 'before hit after' }],
            matchedBlockCount: 1,
            matchedRootCount: 1,
            pageCount: 1,
        });
    });

    it('paginates block.get_children results', async () => {
        const blockApi = await import('@/api/block');
        vi.mocked(blockApi.getChildBlocks).mockResolvedValue([
            { id: 'child-1' },
            { id: 'child-2' },
            { id: 'child-3' },
            { id: 'child-4' },
            { id: 'child-5' },
        ] as any);

        const result = await callBlockTool(client, {
            action: 'get_children',
            id: 'doc-1',
            page: 2,
            pageSize: 2,
        }, enabledActions('get_children'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            children: [
                { id: 'child-3' },
                { id: 'child-4' },
            ],
            totalChildren: 5,
            page: 2,
            pageSize: 2,
            pageCount: 3,
            showing: 2,
            truncated: true,
            hasNextPage: true,
            hint: 'Use page/pageSize to paginate. For focused reads, use block(action="get_kramdown") or search(action="query_sql") with a parent_id filter.',
        });
    });
});
