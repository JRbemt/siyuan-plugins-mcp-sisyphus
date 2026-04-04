export interface SiYuanClientConfig {
    baseUrl?: string;
    timeout?: number;
}

export interface SiYuanResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

export class SiYuanClient {
    private baseUrl: string;
    private timeout: number;
    private token: string = '';

    constructor(config: SiYuanClientConfig = {}) {
        const rawBaseUrl = config.baseUrl
            || process.env.SIYUAN_API_URL
            || 'http://127.0.0.1:6806';
        this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
        this.timeout = config.timeout || 30000;
    }

    setToken(token: string): void {
        this.token = token;
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.token) {
            headers['Authorization'] = `Token ${this.token}`;
        }
        return headers;
    }

    async readFile(path: string): Promise<string> {
        const url = `${this.baseUrl}/api/file/getFile`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Token ${this.token}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ path }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            return await response.text();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async readFileBinary(path: string): Promise<Uint8Array> {
        const url = `${this.baseUrl}/api/file/getFile`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Token ${this.token}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ path }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
            return new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${this.timeout}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async writeFile(path: string, content: string): Promise<void> {
        const url = `${this.baseUrl}/api/file/putFile`;
        const headers: Record<string, string> = {};
        if (this.token) headers['Authorization'] = `Token ${this.token}`;

        const formData = new FormData();
        const file = new File([content], 'content');
        formData.append('path', path);
        formData.append('isDir', 'false');
        formData.append('modTime', String(Date.now()));
        formData.append('file', file);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData,
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
            }

            const result: SiYuanResponse = await response.json();
            if (result.code !== 0) {
                throw new Error(`SiYuan API error: ${result.code} - ${result.msg}`);
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${this.timeout}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async request<T>(endpoint: string, data?: object): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Token ${this.token}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(data ?? {}),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
            }

            const result: SiYuanResponse<T> = await response.json();

            if (result.code !== 0) {
                throw new Error(`SiYuan API error: ${result.code} - ${result.msg}`);
            }

            return result.data;
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${this.timeout}ms`);
                }
                throw error;
            }

            throw new Error('Unknown error occurred during request');
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
