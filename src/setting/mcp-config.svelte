<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";

    import { buildDefaultToolConfig, isDangerousAction, normalizeToolConfig, type BlockAction, type DocumentAction, type FileAction, type NotebookAction, type ToolCategory, type ToolConfig } from "./tool-config";
    import { loadPersistedToolConfig, savePersistedToolConfig } from "./tool-config-storage";
    import SettingPanel from "../libs/components/setting-panel.svelte";

    export let plugin: any;

    type GroupAction = NotebookAction | DocumentAction | BlockAction | FileAction;
    type NotebookPermission = 'none' | 'readonly' | 'write';

    interface GroupDefinition {
        category: ToolCategory;
        icon: string;
        groupKey: string;
        actions: Array<{
            key: GroupAction;
            title: string;
            description: string;
        }>;
    }

    const GROUP_DEFINITIONS: GroupDefinition[] = [
        {
            category: "notebook",
            icon: "📚",
            groupKey: "Notebooks",
            actions: [
                { key: "list", title: "List Notebooks", description: "List all notebooks in the workspace." },
                { key: "create", title: "Create Notebook", description: "Create a new notebook." },
                { key: "open", title: "Open Notebook", description: "Open a notebook." },
                { key: "close", title: "Close Notebook", description: "Close a notebook." },
                { key: "remove", title: "Remove Notebook", description: "Remove a notebook." },
                { key: "rename", title: "Rename Notebook", description: "Rename a notebook." },
                { key: "get_conf", title: "Get Notebook Config", description: "Get notebook configuration." },
                { key: "set_conf", title: "Set Notebook Config", description: "Set notebook configuration." },
                { key: "get_permissions", title: "Get Notebook Permissions", description: "Get MCP access permissions for all notebooks." },
                { key: "set_permission", title: "Set Notebook Permission", description: "Set MCP access permission for a notebook." },
                { key: "get_child_docs", title: "Get Child Documents", description: "Get direct child documents at the notebook root." },
            ],
        },
        {
            category: "document",
            icon: "📝",
            groupKey: "Documents",
            actions: [
                { key: "create", title: "Create Document", description: "Create a new document with markdown content at a human-readable target path." },
                { key: "rename", title: "Rename Document", description: "Rename a document by ID or storage path." },
                { key: "remove", title: "Remove Document", description: "Remove a document by ID or storage path." },
                { key: "move", title: "Move Documents", description: "Move multiple documents by ID or storage path." },
                { key: "get_path", title: "Get Document Path", description: "Get a storage path by document ID." },
                { key: "get_hpath", title: "Get Hierarchical Path", description: "Get a hierarchical path by ID or storage path." },
                { key: "get_ids", title: "Get IDs by Hierarchical Path", description: "Get document IDs by hierarchical path." },
                { key: "get_child_blocks", title: "Get Child Blocks", description: "Get direct child blocks by document ID." },
                { key: "get_child_docs", title: "Get Child Documents", description: "Get direct child documents by document ID." },
            ],
        },
        {
            category: "block",
            icon: "🧱",
            groupKey: "Blocks",
            actions: [
                { key: "insert", title: "Insert Block", description: "Insert a new block at a specified position." },
                { key: "prepend", title: "Prepend Block", description: "Insert a block at the beginning of a parent." },
                { key: "append", title: "Append Block", description: "Insert a block at the end of a parent." },
                { key: "update", title: "Update Block", description: "Update block content." },
                { key: "delete", title: "Delete Block", description: "Delete a block." },
                { key: "move", title: "Move Block", description: "Move a block to a new position." },
                { key: "fold", title: "Fold Block", description: "Fold a foldable block." },
                { key: "unfold", title: "Unfold Block", description: "Unfold a foldable block." },
                { key: "get_kramdown", title: "Get Block Kramdown", description: "Get block content in kramdown format." },
                { key: "get_children", title: "Get Child Blocks", description: "Get all child blocks of a parent." },
                { key: "transfer_ref", title: "Transfer Block Reference", description: "Transfer block references." },
                { key: "set_attrs", title: "Set Block Attributes", description: "Set block attributes." },
                { key: "get_attrs", title: "Get Block Attributes", description: "Get block attributes." },
            ],
        },
        {
            category: "file",
            icon: "📁",
            groupKey: "Files",
            actions: [
                { key: "upload_asset", title: "Upload Asset", description: "Upload a file to the assets directory." },
                { key: "render_template", title: "Render Template", description: "Render a template with document context." },
                { key: "render_sprig", title: "Render Sprig", description: "Render a Sprig template." },
                { key: "export_md", title: "Export Markdown Content", description: "Export document content as Markdown." },
                { key: "export_resources", title: "Export Resources", description: "Export resources as a ZIP archive." },
                { key: "push_msg", title: "Push Message", description: "Push a notification message." },
                { key: "push_err_msg", title: "Push Error Message", description: "Push an error notification message." },
                { key: "get_version", title: "Get Version", description: "Get the SiYuan system version." },
                { key: "get_current_time", title: "Get Current Time", description: "Get the current system time." },
            ],
        },
    ];

    const PERM_GROUP_KEY = "Permissions";
    const PERM_GROUP_LABEL = "🔒 Permissions";
    const defaultGroups = [...GROUP_DEFINITIONS.map((group) => `${group.icon} ${group.groupKey}`), PERM_GROUP_LABEL];

    let config: ToolConfig = buildDefaultToolConfig();
    let groups = defaultGroups;
    let focusGroup = defaultGroups[0];

    let notebookItems: ISettingItem[] = [];
    let documentItems: ISettingItem[] = [];
    let blockItems: ISettingItem[] = [];
    let fileItems: ISettingItem[] = [];

    // Permissions tab state
    interface NotebookInfo { id: string; name: string; }
    let notebooks: NotebookInfo[] = [];
    let permissions: Record<string, NotebookPermission> = {};
    let permItems: ISettingItem[] = [];
    let permLoading = true;

    const getLabel = (key: string, fallback: string) => plugin?.i18n?.[key] ?? fallback;

    const getDangerTitle = (title: string) => `${title} ${getLabel("mcpHighRiskBadge", "[High risk]")}`;
    const getDangerDescription = (description: string) => `${description} ${getLabel("mcpRequiresConfirmation", "Requires explicit user confirmation before execution.")} ${getLabel("mcpDefaultVisible", "This action stays visible in the default configuration.")}`;

    const buildToolToggleItem = (definition: GroupDefinition): ISettingItem => ({
        type: "checkbox",
        key: `${definition.category}__enabled`,
        value: config[definition.category].enabled,
        title: getLabel(`${definition.category}_tool_title`, `${definition.groupKey} Tool`),
        description: getLabel(`${definition.category}_tool_desc`, `Expose the grouped ${definition.category} tool to MCP clients.`),
    });

    const buildActionItems = (definition: GroupDefinition): ISettingItem[] => definition.actions.map((action) => {
        const baseTitle = getLabel(`${definition.category}_action_${action.key}`, action.title);
        const baseDescription = getLabel(`desc_${definition.category}_action_${action.key}`, action.description);
        const dangerous = isDangerousAction(definition.category, action.key);

        return {
            type: "checkbox",
            key: `${definition.category}__action__${action.key}`,
            value: config[definition.category].actions[action.key as keyof typeof config[typeof definition.category]["actions"]],
            title: dangerous ? getDangerTitle(baseTitle) : baseTitle,
            description: dangerous ? getDangerDescription(baseDescription) : baseDescription,
        };
    });

    function buildPermItems(): ISettingItem[] {
        if (notebooks.length === 0) {
            return [{
                type: "hint",
                key: "perm__hint",
                value: permLoading ? "Loading notebooks..." : "No notebooks found.",
                title: "",
                description: "",
            }];
        }
        return notebooks.map((nb) => ({
            type: "select",
            key: `perm__${nb.id}`,
            value: permissions[nb.id] ?? "write",
            title: nb.name,
            description: getLabel("mcpPermDesc", "MCP 访问权限：读写 / 只读 / 禁止访问"),
            options: {
                write: getLabel("mcpPermWrite", "读写"),
                readonly: getLabel("mcpPermReadonly", "只读"),
                none: getLabel("mcpPermNone", "禁止访问"),
            },
        }));
    }

    function refreshItems() {
        notebookItems = [buildToolToggleItem(GROUP_DEFINITIONS[0]), ...buildActionItems(GROUP_DEFINITIONS[0])];
        documentItems = [buildToolToggleItem(GROUP_DEFINITIONS[1]), ...buildActionItems(GROUP_DEFINITIONS[1])];
        blockItems = [buildToolToggleItem(GROUP_DEFINITIONS[2]), ...buildActionItems(GROUP_DEFINITIONS[2])];
        fileItems = [buildToolToggleItem(GROUP_DEFINITIONS[3]), ...buildActionItems(GROUP_DEFINITIONS[3])];
        permItems = buildPermItems();
    }

    $: permGroupLabel = `🔒 ${getLabel(PERM_GROUP_KEY, PERM_GROUP_LABEL)}`;
    $: groups = [...GROUP_DEFINITIONS.map((group) => `${group.icon} ${getLabel(group.groupKey, group.groupKey)}`), permGroupLabel];
    $: if (!groups.includes(focusGroup)) {
        focusGroup = groups[0];
    }
    $: config, notebooks, permissions, refreshItems();

    async function loadNotebooks() {
        try {
            const resp = await fetch("http://127.0.0.1:6806/api/notebook/lsNotebooks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const json = await resp.json();
            notebooks = (json?.data?.notebooks ?? []).map((nb: any) => ({ id: nb.id, name: nb.name }));
        } catch {
            notebooks = [];
        }
        permLoading = false;
        permItems = buildPermItems();
    }

    onMount(async () => {
        config = await loadPersistedToolConfig(plugin);

        const savedPerms = await plugin?.loadData("notebookPermissions");
        if (savedPerms && typeof savedPerms === "object") {
            permissions = savedPerms as Record<string, NotebookPermission>;
        }

        await loadNotebooks();
    });

    function setCategoryEnabled(category: ToolCategory, enabled: boolean) {
        config = {
            ...config,
            [category]: {
                ...config[category],
                enabled,
            },
        };
    }

    function setActionEnabled(category: ToolCategory, action: string, enabled: boolean) {
        const nextActions = {
            ...config[category].actions,
            [action]: enabled,
        };
        const hasEnabledActions = Object.values(nextActions).some(Boolean);

        config = {
            ...config,
            [category]: {
                enabled: enabled ? true : hasEnabledActions ? config[category].enabled : false,
                actions: nextActions,
            },
        };
    }

    async function persistConfig() {
        if (plugin) {
            config = await savePersistedToolConfig(config, plugin);
        }
    }

    async function persistPermissions() {
        if (plugin) {
            await plugin.saveData("notebookPermissions", permissions);
        }
    }

    interface ChangeEvent {
        key: string;
        value: any;
    }

    const onChanged = async (event: CustomEvent<ChangeEvent>) => {
        const { key, value } = event.detail;

        if (key.startsWith("perm__") && key !== "perm__hint") {
            const notebookId = key.slice("perm__".length);
            permissions = { ...permissions, [notebookId]: value as NotebookPermission };
            permItems = buildPermItems();
            await persistPermissions();
            return;
        }

        if (key.endsWith("__enabled")) {
            const category = key.replace("__enabled", "") as ToolCategory;
            setCategoryEnabled(category, Boolean(value));
            await persistConfig();
            return;
        }

        const [category, , action] = key.split("__");
        if (category && action) {
            setActionEnabled(category as ToolCategory, action, Boolean(value));
            await persistConfig();
        }
    };

    export async function saveSettings() {
        await persistConfig();
        showMessage(plugin?.i18n?.mcpConfigSaved || "✅ MCP Tools configuration saved");
    }

    export async function resetDefaults() {
        config = normalizeToolConfig(buildDefaultToolConfig());
        await persistConfig();
        showMessage(plugin?.i18n?.mcpConfigReset || "🔄 MCP Tools configuration reset to defaults");
    }
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <li
                data-name="mcp-config"
                class:b3-list-item--focus={group === focusGroup}
                class="b3-list-item"
                on:click={() => {
                    focusGroup = group;
                }}
                on:keydown={() => {}}
            >
                <span class="b3-list-item__text">{group}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        <SettingPanel group={groups[0]} settingItems={notebookItems} display={focusGroup === groups[0]} on:changed={onChanged} />
        <SettingPanel group={groups[1]} settingItems={documentItems} display={focusGroup === groups[1]} on:changed={onChanged} />
        <SettingPanel group={groups[2]} settingItems={blockItems} display={focusGroup === groups[2]} on:changed={onChanged} />
        <SettingPanel group={groups[3]} settingItems={fileItems} display={focusGroup === groups[3]} on:changed={onChanged} />
        <SettingPanel group={permGroupLabel} settingItems={permItems} display={focusGroup === permGroupLabel} on:changed={onChanged} />
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
    }

    .config__panel > ul > li {
        padding-left: 1rem;
    }

    .config__tab-wrap {
        max-height: calc(100vh - 250px);
        overflow-y: auto;
        overflow-x: hidden;
        scroll-behavior: smooth;
    }
</style>
