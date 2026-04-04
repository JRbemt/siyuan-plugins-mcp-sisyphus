import { normalizeToolConfig, type ToolConfig } from "./tool-config";

const CONFIG_STORAGE_KEY = "mcpToolsConfig";
const PUPPY_SETTINGS_STORAGE_KEY = "puppySettings";

const DEFAULT_PUPPY_TEST_INTERVAL_MS = 2200;

type PluginStorage = {
    loadData?: (storageName: string) => Promise<unknown>;
    saveData?: (storageName: string, content: unknown) => Promise<void>;
};

export interface PuppySettings {
    visible: boolean;
    testModeEnabled: boolean;
    testModeIntervalMs: number;
    showBubble: boolean;
    showClickHint: boolean;
}

export function buildDefaultPuppySettings(): PuppySettings {
    return {
        visible: true,
        testModeEnabled: false,
        testModeIntervalMs: DEFAULT_PUPPY_TEST_INTERVAL_MS,
        showBubble: false,
        showClickHint: true,
    };
}

export function normalizePuppySettings(raw: unknown): PuppySettings {
    const defaults = buildDefaultPuppySettings();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return defaults;
    }

    const record = raw as Record<string, unknown>;
    const rawInterval = typeof record.testModeIntervalMs === "number" && Number.isFinite(record.testModeIntervalMs)
        ? Math.floor(record.testModeIntervalMs)
        : defaults.testModeIntervalMs;

    return {
        visible: typeof record.visible === "boolean" ? record.visible : defaults.visible,
        testModeEnabled: typeof record.testModeEnabled === "boolean" ? record.testModeEnabled : defaults.testModeEnabled,
        testModeIntervalMs: Math.max(800, Math.min(10000, rawInterval)),
        showBubble: typeof record.showBubble === "boolean" ? record.showBubble : defaults.showBubble,
        showClickHint: typeof record.showClickHint === "boolean" ? record.showClickHint : defaults.showClickHint,
    };
}

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

export async function loadPersistedPuppySettings(plugin?: PluginStorage): Promise<PuppySettings> {
    const raw = await plugin?.loadData?.(PUPPY_SETTINGS_STORAGE_KEY);
    return normalizePuppySettings(raw);
}

export async function savePersistedPuppySettings(settings: PuppySettings, plugin?: PluginStorage): Promise<PuppySettings> {
    const normalized = normalizePuppySettings(settings);
    if (plugin?.saveData) {
        await plugin.saveData(PUPPY_SETTINGS_STORAGE_KEY, normalized);
    }
    return normalized;
}
