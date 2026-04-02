import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionManager, type NotebookPermission } from '@/mcp/permissions';
import type { SiYuanClient } from '@/api/client';

describe('PermissionManager', () => {
    let mockClient: SiYuanClient;
    let manager: PermissionManager;

    beforeEach(() => {
        mockClient = {
            readFile: vi.fn(),
            writeFile: vi.fn(),
        } as unknown as SiYuanClient;
        manager = new PermissionManager(mockClient);
    });

    describe('constructor', () => {
        it('should create manager without client', () => {
            const mgr = new PermissionManager();
            expect(mgr).toBeDefined();
        });

        it('should create manager with client', () => {
            expect(manager).toBeDefined();
        });
    });

    describe('load', () => {
        it('should load permissions from API', async () => {
            const permissions = { notebook1: 'write', notebook2: 'readonly' };
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify(permissions));

            await manager.load();
            expect(manager.getAll()).toEqual(permissions);
        });

        it('should handle empty API response gracefully', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue('{}');

            await manager.load();
            expect(manager.getAll()).toEqual({});
        });

        it('should handle API error gracefully', async () => {
            vi.mocked(mockClient.readFile).mockRejectedValue(new Error('API error'));

            await manager.load();
            expect(manager.getAll()).toEqual({});
        });

        it('should skip loading if already loaded', async () => {
            const permissions = { notebook1: 'write' };
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify(permissions));

            await manager.load();
            await manager.load(); // Second call should be skipped

            expect(mockClient.readFile).toHaveBeenCalledTimes(1);
        });
    });

    describe('reload', () => {
        it('should force reload permissions', async () => {
            const permissions1 = { notebook1: 'write' };
            const permissions2 = { notebook1: 'readonly' };

            vi.mocked(mockClient.readFile)
                .mockResolvedValueOnce(JSON.stringify(permissions1))
                .mockResolvedValueOnce(JSON.stringify(permissions2));

            await manager.load();
            await manager.reload();

            expect(mockClient.readFile).toHaveBeenCalledTimes(2);
            expect(manager.get('notebook1')).toBe('readonly');
        });
    });

    describe('get', () => {
        it('should return permission for existing notebook', async () => {
            const permissions = { nb1: 'write', nb2: 'readonly' };
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify(permissions));

            await manager.load();
            expect(manager.get('nb1')).toBe('write');
            expect(manager.get('nb2')).toBe('readonly');
        });

        it('should default to write for unknown notebook', async () => {
            await manager.load();
            expect(manager.get('unknown')).toBe('write');
        });
    });

    describe('set', () => {
        it('should set permission and save', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue('{}');
            vi.mocked(mockClient.writeFile).mockResolvedValue();

            await manager.load();
            await manager.set('notebook1', 'readonly');

            expect(mockClient.writeFile).toHaveBeenCalled();
            expect(manager.get('notebook1')).toBe('readonly');
        });

        it('should handle all permission levels', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue('{}');
            vi.mocked(mockClient.writeFile).mockResolvedValue();

            await manager.load();

            const levels: NotebookPermission[] = ['none', 'readonly', 'write'];
            for (const level of levels) {
                await manager.set(`nb-${level}`, level);
                expect(manager.get(`nb-${level}`)).toBe(level);
            }
        });
    });

    describe('canRead', () => {
        it('should return true for write permission', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify({ nb: 'write' }));
            await manager.load();
            expect(manager.canRead('nb')).toBe(true);
        });

        it('should return true for readonly permission', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify({ nb: 'readonly' }));
            await manager.load();
            expect(manager.canRead('nb')).toBe(true);
        });

        it('should return false for none permission', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify({ nb: 'none' }));
            await manager.load();
            expect(manager.canRead('nb')).toBe(false);
        });

        it('should return true for unknown notebook (defaults to write)', async () => {
            await manager.load();
            expect(manager.canRead('unknown')).toBe(true);
        });
    });

    describe('canWrite', () => {
        it('should return true for write permission', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify({ nb: 'write' }));
            await manager.load();
            expect(manager.canWrite('nb')).toBe(true);
        });

        it('should return false for readonly permission', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify({ nb: 'readonly' }));
            await manager.load();
            expect(manager.canWrite('nb')).toBe(false);
        });

        it('should return false for none permission', async () => {
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify({ nb: 'none' }));
            await manager.load();
            expect(manager.canWrite('nb')).toBe(false);
        });

        it('should return true for unknown notebook (defaults to write)', async () => {
            await manager.load();
            expect(manager.canWrite('unknown')).toBe(true);
        });
    });

    describe('getAll', () => {
        it('should return copy of all permissions', async () => {
            const permissions = { nb1: 'write', nb2: 'readonly' };
            vi.mocked(mockClient.readFile).mockResolvedValue(JSON.stringify(permissions));

            await manager.load();
            const all = manager.getAll();

            expect(all).toEqual(permissions);
            // Verify it's a copy
            all.nb1 = 'none';
            expect(manager.get('nb1')).toBe('write');
        });
    });
});
