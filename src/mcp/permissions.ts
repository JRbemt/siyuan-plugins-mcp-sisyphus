import fs from 'fs';
import path from 'path';

import type { SiYuanClient } from '../api/client';

export type NotebookPermission = 'none' | 'readonly' | 'write';

const PERMISSIONS_FILENAME = 'notebookPermissions';
const PERMISSIONS_API_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions';
const DEBUG_PERMISSIONS = process.env.SIYUAN_MCP_DEBUG_PERMISSIONS === '1';

function logPermissionDebug(...args: unknown[]) {
    if (DEBUG_PERMISSIONS) {
        console.error('[MCP]', ...args);
    }
}

function resolvePermissionsPaths(): string[] {
    const paths: string[] = [];
    const envDataDir = process.env.SIYUAN_DATA_DIR;
    if (envDataDir) {
        paths.push(path.join(envDataDir, 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
        paths.push(path.join(envDataDir, 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
    }
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
        paths.push(path.join(homeDir, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
        paths.push(path.join(homeDir, '.siyuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA || '';
            if (appData) {
                paths.push(path.join(appData, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
            }
        }
    }
    return paths;
}

export class PermissionManager {
    private savePath: string | null = null;
    private permissions: Record<string, NotebookPermission> = {};
    private client: SiYuanClient | null = null;
    private loaded = false;

    constructor(client?: SiYuanClient) {
        this.client = client ?? null;
    }

    /**
     * Load permissions from SiYuan API (preferred) or filesystem
     */
    async load(): Promise<void> {
        // Already loaded, skip
        if (this.loaded) return;

        // Try to load from API first if client is available
        if (this.client) {
            try {
                const content = await this.client.readFile(PERMISSIONS_API_PATH);
                if (content) {
                    this.permissions = JSON.parse(content);
                    this.loaded = true;
                    logPermissionDebug('Permissions loaded from API:', Object.keys(this.permissions).length, 'entries');
                    return;
                }
            } catch (e) {
                logPermissionDebug('Failed to load permissions from API:', e);
            }
        }

        // Fallback to filesystem
        const candidates = resolvePermissionsPaths();
        for (const p of candidates) {
            if (!fs.existsSync(p)) continue;
            try {
                this.permissions = JSON.parse(fs.readFileSync(p, 'utf-8'));
                this.savePath = p;
                this.loaded = true;
                logPermissionDebug('Permissions loaded from filesystem:', p, Object.keys(this.permissions).length, 'entries');
                return;
            } catch (e) {
                logPermissionDebug('Failed to parse permissions from:', p, e);
            }
        }

        logPermissionDebug('No permissions file found, using empty permissions');
        this.loaded = true;
    }

    /**
     * Force reload permissions from storage
     */
    async reload(): Promise<void> {
        this.loaded = false;
        await this.load();
    }

    private getFallbackSavePath(): string {
        if (!this.savePath) {
            const candidates = resolvePermissionsPaths();
            this.savePath = candidates[0] ?? path.join(process.cwd(), PERMISSIONS_FILENAME);
        }
        return this.savePath;
    }

    async save(): Promise<void> {
        const serialized = JSON.stringify(this.permissions, null, 2);

        if (this.client) {
            try {
                await this.client.writeFile(PERMISSIONS_API_PATH, serialized);
                this.loaded = true;
                return;
            } catch (error) {
                console.error('[MCP] Failed to save permissions via API, falling back to filesystem:', error);
            }
        }

        const savePath = this.getFallbackSavePath();
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        fs.writeFileSync(savePath, serialized, 'utf-8');
        this.loaded = true;
    }

    get(notebookId: string): NotebookPermission {
        return this.permissions[notebookId] ?? 'write';
    }

    async set(notebookId: string, perm: NotebookPermission): Promise<void> {
        this.permissions[notebookId] = perm;
        await this.save();
    }

    getAll(): Record<string, NotebookPermission> {
        return { ...this.permissions };
    }

    canRead(notebookId: string): boolean {
        return this.get(notebookId) !== 'none';
    }

    canWrite(notebookId: string): boolean {
        return this.get(notebookId) === 'write';
    }
}
