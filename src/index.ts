import {
    Plugin,
    showMessage,
    Dialog,
} from "siyuan";
import "./index.scss";

import { loadPersistedToolConfig, savePersistedToolConfig } from "@/setting/tool-config-storage";
import McpConfig from "@/setting/mcp-config.svelte";

export default class SiyuanMCP extends Plugin {

    async onload() {
        const normalized = await loadPersistedToolConfig(this);
        await savePersistedToolConfig(normalized, this);
    }

    onLayoutReady() {}

    onunload() {
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
