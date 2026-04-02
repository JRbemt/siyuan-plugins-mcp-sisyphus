import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSiYuanServer } from '@/mcp/server';

describe('MCP Server Integration', () => {
    let client: Client;

    beforeEach(async () => {
        global.fetch = vi.fn();

        // Mock all API responses: token + permission load + config read
        vi.mocked(global.fetch).mockImplementation(async (url) => {
            const urlStr = String(url);

            // Token retrieval
            if (urlStr.includes('/api/system/getConf')) {
                return {
                    ok: true,
                    json: async () => ({ code: 0, msg: 'success', data: { conf: { api: { token: 'test-token' } } } }),
                } as Response;
            }

            // Permission file read
            if (urlStr.includes('/api/file/getFile')) {
                return {
                    ok: true,
                    text: async () => '{}',
                } as Response;
            }

            // Default: successful empty response
            return {
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: {} }),
            } as Response;
        });

        const server = await createSiYuanServer();

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);

        client = new Client({ name: 'test-client', version: '1.0.0' });
        await client.connect(clientTransport);
    });

    describe('Server creation and tool listing', () => {
        it('should list tools with expected names', async () => {
            const { tools } = await client.listTools();

            expect(tools.length).toBeGreaterThan(0);

            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('notebook');
            expect(toolNames).toContain('document');
            expect(toolNames).toContain('block');
            expect(toolNames).toContain('search');
            expect(toolNames).toContain('file');
            expect(toolNames).toContain('tag');
            expect(toolNames).toContain('system');
        });

        it('should have action enum in each tool input schema', async () => {
            const { tools } = await client.listTools();

            for (const tool of tools) {
                const schema = tool.inputSchema as Record<string, any>;
                expect(schema.properties?.action?.enum).toBeDefined();
                expect(schema.properties?.action?.enum.length).toBeGreaterThan(0);
            }
        });

        it('should have descriptions for all tools', async () => {
            const { tools } = await client.listTools();

            for (const tool of tools) {
                expect(tool.description).toBeTruthy();
                expect(tool.description!.length).toBeGreaterThan(10);
            }
        });
    });

    describe('Resource listing', () => {
        it('should list available resources', async () => {
            const { resources } = await client.listResources();
            expect(resources.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should return error for unknown tool', async () => {
            const result = await client.callTool({ name: 'nonexistent', arguments: {} });
            expect(result.isError).toBe(true);
        });
    });
});
