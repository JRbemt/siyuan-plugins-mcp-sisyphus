import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "./index.scss";

import {
    buildDefaultPuppySettings,
    loadPersistedPuppySettings,
    loadPersistedToolConfig,
    savePersistedToolConfig,
    type PuppySettings,
} from "@/setting/tool-config-storage";
import McpConfig from "@/setting/mcp-config.svelte";
import ToolPuppy from "@/components/ToolPuppy.svelte";

export default class SiyuanMCP extends Plugin {
    private puppyComponent: ToolPuppy | null = null;
    private puppyVisible = true;
    private puppyContainer: HTMLElement | null = null;
    private puppySettings: PuppySettings = buildDefaultPuppySettings();
    async onload() {
        const normalized = await loadPersistedToolConfig(this);
        await savePersistedToolConfig(normalized, this);
        this.puppySettings = await loadPersistedPuppySettings(this);
        this.puppyVisible = this.puppySettings.visible;
    }

    onLayoutReady() {
        this.puppyContainer = document.createElement('div');
        this.puppyContainer.id = 'sy-puppy-root';
        document.body.appendChild(this.puppyContainer);
        this.puppyComponent = new ToolPuppy({
            target: this.puppyContainer,
            props: {
                visible: this.puppyVisible,
                testModeEnabled: this.puppySettings.testModeEnabled,
                testModeIntervalMs: this.puppySettings.testModeIntervalMs,
                showBubble: this.puppySettings.showBubble,
                showClickHint: this.puppySettings.showClickHint,
            },
        });
    }


    updatePuppyTestSettings(settings: PuppySettings) {
        this.puppySettings = settings;
        this.puppyVisible = settings.visible;
        if (this.puppyComponent) {
            this.puppyComponent.$set({
                visible: settings.visible,
                testModeEnabled: settings.testModeEnabled,
                testModeIntervalMs: settings.testModeIntervalMs,
                showBubble: settings.showBubble,
                showClickHint: settings.showClickHint,
            });
        }
    }

    onunload() {
        if (this.puppyComponent) {
            this.puppyComponent.$destroy();
            this.puppyComponent = null;
        }
        if (this.puppyContainer) {
            this.puppyContainer.remove();
            this.puppyContainer = null;
        }
    }

    uninstall() {
        this.removeData("mcpToolsConfig").catch(e => {
            showMessage(`uninstall [${this.name}] remove data [mcpToolsConfig] fail: ${e.msg}`);
        });
    }

    /**
     * A custom setting pannel provided by svelte
     */
    openSetting(): void {
        let dialog = new Dialog({
            title: this.i18n.mcpToolsSettingTitle,
            content: `<div id="SettingPanel" style="height: 100%;"></div>`,
            width: "800px",
            destroyCallback: () => {
                //You'd better destroy the component when the dialog is closed
                pannel.$destroy();
            }
        });
        let pannel = new McpConfig({
            target: dialog.element.querySelector("#SettingPanel"),
            props: {
                plugin: this
            }
        });
    }

}
