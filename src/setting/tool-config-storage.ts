import { normalizeToolConfig, type ToolConfig } from "./tool-config";

const CONFIG_STORAGE_KEY = "mcpToolsConfig";

type PluginStorage = {
    loadData?: (storageName: string) => Promise<unknown>;
    saveData?: (storageName: string, content: unknown) => Promise<void>;
};

export async function loadPersistedToolConfig(plugin?: PluginStorage): Promise<ToolConfig> {
    const raw = await plugin?.loadData?.(CONFIG_STORAGE_KEY);
    return normalizeToolConfig(raw);
}

export async function savePersistedToolConfig(config: ToolConfig, plugin?: PluginStorage): Promise<ToolConfig> {
    const normalized = normalizeToolConfig(config);
    if (plugin?.saveData) {
        await plugin.saveData(CONFIG_STORAGE_KEY, normalized);
    }
    return normalized;
}
