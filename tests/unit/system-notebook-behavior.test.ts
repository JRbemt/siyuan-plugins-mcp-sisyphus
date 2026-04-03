import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CategoryToolConfig } from '@/mcp/config';
import { callNotebookTool } from '@/mcp/tools/notebook';
import { callSystemTool } from '@/mcp/tools/system';

import * as notebookApi from '@/api/notebook';
import * as systemApi from '@/api/system';

function parseResult(result: Awaited<ReturnType<typeof callNotebookTool>> | Awaited<ReturnType<typeof callSystemTool>>) {
    return JSON.parse(result.content[0].text);
}

const notebookConfig: CategoryToolConfig<'list' | 'create' | 'open' | 'close' | 'remove' | 'rename' | 'get_conf' | 'set_conf' | 'set_icon' | 'get_permissions' | 'set_permission' | 'get_child_docs'> = {
    enabled: true,
    actions: {
        list: true,
        create: true,
        open: true,
        close: true,
        remove: true,
        rename: true,
        get_conf: true,
        set_conf: true,
        set_icon: true,
        get_permissions: true,
        set_permission: true,
        get_child_docs: true,
    },
};

const systemConfig: CategoryToolConfig<'workspace_info' | 'network' | 'changelog' | 'conf' | 'sys_fonts' | 'boot_progress' | 'push_msg' | 'push_err_msg' | 'get_version' | 'get_current_time'> = {
    enabled: true,
    actions: {
        workspace_info: true,
        network: true,
        changelog: true,
        conf: true,
        sys_fonts: true,
        boot_progress: true,
        push_msg: true,
        push_err_msg: true,
        get_version: true,
        get_current_time: true,
    },
};

const permMgr = {
    reload: vi.fn(async () => undefined),
    canRead: vi.fn(() => true),
    canWrite: vi.fn(() => true),
    canDelete: vi.fn(() => true),
    get: vi.fn((notebookId: string) => notebookId === 'nb-2' ? 'r' : 'rwd'),
    set: vi.fn(async () => undefined),
};

describe('system and notebook behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        permMgr.reload.mockClear();
        permMgr.get.mockImplementation((notebookId: string) => notebookId === 'nb-2' ? 'r' : 'rwd');
    });

    it('returns all notebook permissions when notebook is omitted', async () => {
        vi.spyOn(notebookApi, 'listNotebooks').mockResolvedValue({
            notebooks: [
                { id: 'nb-1', name: 'One' },
                { id: 'nb-2', name: 'Two' },
            ],
        } as never);

        const result = await callNotebookTool({} as never, { action: 'get_permissions' }, notebookConfig, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.notebooks).toHaveLength(2);
        expect(parsed.notebooks[1].permission).toBe('r');
    });

    it('adds an icon reminder to notebook create results', async () => {
        vi.spyOn(notebookApi, 'createNotebook').mockResolvedValue({
            notebook: { id: 'nb-1', name: 'One' },
        } as never);

        const result = await callNotebookTool({} as never, { action: 'create', name: 'One' }, notebookConfig, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.id).toBe('nb-1');
        expect(parsed.iconHint).toContain('notebook(action="set_icon")');
        expect(parsed.iconHint).toContain('Unicode hex code string');
    });

    it('returns all notebook permissions when notebook is "all"', async () => {
        vi.spyOn(notebookApi, 'listNotebooks').mockResolvedValue({
            notebooks: [
                { id: 'nb-1', name: 'One' },
                { id: 'nb-2', name: 'Two' },
            ],
        } as never);

        const result = await callNotebookTool({} as never, { action: 'get_permissions', notebook: 'all' }, notebookConfig, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.notebooks).toHaveLength(2);
    });

    it('returns a single notebook permission when a notebook ID is provided', async () => {
        vi.spyOn(notebookApi, 'listNotebooks').mockResolvedValue({
            notebooks: [
                { id: 'nb-1', name: 'One' },
                { id: 'nb-2', name: 'Two' },
            ],
        } as never);

        const result = await callNotebookTool({} as never, { action: 'get_permissions', notebook: 'nb-2' }, notebookConfig, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.notebook).toEqual({
            id: 'nb-2',
            name: 'Two',
            permission: 'r',
        });
    });

    it('returns a structured error when a notebook ID is not found', async () => {
        vi.spyOn(notebookApi, 'listNotebooks').mockResolvedValue({
            notebooks: [{ id: 'nb-1', name: 'One' }],
        } as never);

        const result = await callNotebookTool({} as never, { action: 'get_permissions', notebook: 'missing' }, notebookConfig, permMgr as never);
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error.message).toContain('Notebook "missing" not found.');
        expect(parsed.error.tool).toBe('notebook');
        expect(parsed.error.action).toBe('get_permissions');
    });

    it('uses conf-prefixed keyPath examples in summary hints', async () => {
        vi.spyOn(systemApi, 'getConf').mockResolvedValue({
            conf: {
                appearance: { mode: 0 },
                langs: [{ label: '中文', name: 'zh_CN' }],
            },
            isPublish: false,
            start: false,
        });

        const result = await callSystemTool({} as never, { action: 'conf', mode: 'summary' }, systemConfig, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.hints[1]).toContain('conf.appearance.mode');
        expect(parsed.hints[1]).toContain('conf.langs[0]');
    });

    it('reads config values using conf-prefixed keyPath examples', async () => {
        vi.spyOn(systemApi, 'getConf').mockResolvedValue({
            conf: {
                appearance: { mode: 0 },
                langs: [{ label: '中文', name: 'zh_CN' }],
            },
            isPublish: false,
            start: false,
        });

        const result = await callSystemTool({} as never, { action: 'conf', mode: 'get', keyPath: 'conf.appearance.mode' }, systemConfig, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.keyPath).toBe('conf.appearance.mode');
        expect(parsed.value.value).toBe(0);
    });
});
