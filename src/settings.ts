import type { App } from "obsidian";
import { DropdownComponent, Modal, PluginSettingTab, Setting } from "obsidian";
import type VizardryPlugin from "./main";
import { saveSecret, loadSecret, listSecrets } from "./shared/keychain";

export interface PluginSettings {
  // Linear
  linearEnabled: boolean;
  linearBaseUrl: string;
  /** Logical name under which the Linear API key is stored in app.secretStorage. */
  linearSecretName: string;

  // LLM
  llmProvider: "anthropic" | "openai";
  llmModel: string;
  /** Logical name under which the LLM API key is stored in app.secretStorage. */
  llmSecretName: string;

  // Cache TTLs
  summaryTtlHours: number;
  statusTtlMinutes: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  linearEnabled: false,
  linearBaseUrl: "https://api.linear.app/graphql",
  linearSecretName: "vzd-linear-key",
  llmProvider: "anthropic",
  llmModel: "claude-haiku-4-5-20251001",
  llmSecretName: "vzd-llm-key",
  summaryTtlHours: 24,
  statusTtlMinutes: 5,
};

const ANTHROPIC_MODELS = [
  { value: "claude-haiku-4-5-20251001",  label: "Claude Haiku 4.5 (fast, cheap)" },
  { value: "claude-sonnet-4-5-20251001", label: "Claude Sonnet 4.5 (balanced)" },
];

const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini (fast, cheap)" },
  { value: "gpt-4o",      label: "GPT-4o (balanced)" },
];

// ── Secret picker modal ───────────────────────────────────────────────────────

class SecretPickerModal extends Modal {
  private onSelect: (name: string) => void;
  private currentName: string;
  private selected: string;

  constructor(app: App, currentName: string, onSelect: (name: string) => void) {
    super(app);
    this.currentName = currentName;
    this.selected = currentName;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vzd-secret-picker");
    contentEl.createEl("h2", { text: "Select secret" });

    // Search
    const search = contentEl.createEl("input", {
      cls: "vzd-secret-search",
      attr: { type: "text", placeholder: "Search secrets…" },
    });

    // List
    const listEl = contentEl.createEl("div", { cls: "vzd-secret-list" });

    const allNames = listSecrets(this.app);

    const render = (filter: string): void => {
      listEl.empty();
      const names = filter
        ? allNames.filter(n => n.toLowerCase().includes(filter.toLowerCase()))
        : allNames;

      if (names.length === 0) {
        listEl.createEl("div", { cls: "vzd-secret-empty", text: "No secrets stored yet." });
        return;
      }

      for (const name of names) {
        const row = listEl.createEl("label", { cls: "vzd-secret-row" });
        if (name === this.selected) row.addClass("vzd-secret-row--selected");

        const radio = row.createEl("input", { attr: { type: "radio", name: "vzd-secret" } }) as HTMLInputElement;
        radio.checked = name === this.selected;

        row.createEl("span", { cls: "vzd-secret-name", text: name });
        row.createEl("span", { cls: "vzd-secret-dots", text: "••••••••" });

        if (name === this.selected) {
          row.createEl("span", { cls: "vzd-secret-badge", text: "Selected" });
        }

        radio.addEventListener("change", () => {
          this.selected = name;
          listEl.querySelectorAll(".vzd-secret-row").forEach(r => r.removeClass("vzd-secret-row--selected"));
          listEl.querySelectorAll(".vzd-secret-badge").forEach(b => b.remove());
          row.addClass("vzd-secret-row--selected");
          row.createEl("span", { cls: "vzd-secret-badge", text: "Selected" });
        });
      }
    };

    render("");
    search.addEventListener("input", () => render(search.value));

    // Footer
    const footer = contentEl.createEl("div", { cls: "vzd-secret-footer" });

    const saveBtn = footer.createEl("button", { cls: "mod-cta", text: "Save" });
    saveBtn.addEventListener("click", () => {
      this.onSelect(this.selected);
      this.close();
    });

    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ── Secret setting row ────────────────────────────────────────────────────────

/**
 * Renders a single settings row for a secret:
 * - Displays the currently linked secret name with a "Key found ✓" / "Not set" badge.
 * - "Link…" button opens SecretPickerModal to choose from existing secrets.
 * - Password field to enter a new value directly (creates a new secret under the current name).
 */
function addSecretRow(
  containerEl: HTMLElement,
  app: App,
  label: string,
  valuePlaceholder: string,
  getName: () => string,
  setName: (n: string) => void,
): void {
  let currentName = getName();

  const refreshRow = (): void => {
    setting.clear();
    setting.setDesc(`Secret name: ${currentName}`);

    // Badge starts neutral; updated async below
    const badge = setting.nameEl.createEl("span", { cls: "vzd-secret-status vzd-secret-missing", text: "…" });
    setting.nameEl.insertBefore(badge, setting.nameEl.firstChild);
    setting.nameEl.insertBefore(document.createTextNode(label + "  "), setting.nameEl.firstChild);

    // Link button
    setting.addButton(btn => {
      btn.setButtonText("Link…").onClick(() => {
        new SecretPickerModal(app, currentName, (name) => {
          currentName = name;
          setName(name);
          refreshRow();
        }).open();
      });
    });

    // Password field for direct entry
    setting.addText(text => {
      text.inputEl.setAttribute("type", "password");
      text.setPlaceholder(valuePlaceholder);

      // Async: probe storage, set initial badge + mask
      void loadSecret(app, currentName).then(existing => {
        badge.textContent = existing ? "Key found ✓" : "Not set";
        badge.className = "vzd-secret-status " + (existing ? "vzd-secret-found" : "vzd-secret-missing");
        text.setValue(existing ? "••••••••" : "");
      });

      text.inputEl.addEventListener("focus", () => {
        if (text.getValue() === "••••••••") {
          void loadSecret(app, currentName).then(v => text.setValue(v ?? ""));
        }
      });

      const persistValue = (): void => {
        const v = text.getValue().trim();
        if (v && v !== "••••••••") {
          void saveSecret(app, currentName, v).then(() =>
            loadSecret(app, currentName).then(stored => {
              text.setValue(stored ? "••••••••" : "");
              badge.textContent = stored ? "Key found ✓" : "Not set";
              badge.className = "vzd-secret-status " + (stored ? "vzd-secret-found" : "vzd-secret-missing");
            })
          );
        } else {
          void loadSecret(app, currentName).then(stored => {
            text.setValue(stored ? "••••••••" : "");
            badge.textContent = stored ? "Key found ✓" : "Not set";
            badge.className = "vzd-secret-status " + (stored ? "vzd-secret-found" : "vzd-secret-missing");
          });
        }
      };

      // blur: works on desktop; Enter key: needed for mobile — the virtual
      // keyboard's "Done" button fires Enter but may not trigger blur before
      // the user navigates away from the settings tab.
      text.inputEl.addEventListener("blur", persistValue);
      text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          text.inputEl.blur(); // triggers blur → persistValue
        }
      });
    });
  };

  const setting = new Setting(containerEl).setName("");
  refreshRow();
}

// ── Settings tab ──────────────────────────────────────────────────────────────

export class VizardrySettingTab extends PluginSettingTab {
  private plugin: VizardryPlugin;

  constructor(app: App, plugin: VizardryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Linear ─────────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Linear" });

    new Setting(containerEl)
      .setName("Enable Linear integration")
      .setDesc("Show issue status on roadmap cards and generate AI summaries on hover.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.linearEnabled)
          .onChange(async (value) => {
            this.plugin.settings.linearEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    addSecretRow(
      containerEl,
      this.app,
      "Linear API key",
      "lin_api_…",
      () => this.plugin.settings.linearSecretName,
      (n) => { this.plugin.settings.linearSecretName = n; void this.plugin.saveSettings(); },
    );

    new Setting(containerEl)
      .setName("Linear GraphQL URL")
      .setDesc("Change only if you are using a self-hosted Linear instance.")
      .addText(text =>
        text
          .setPlaceholder("https://api.linear.app/graphql")
          .setValue(this.plugin.settings.linearBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.linearBaseUrl = value.trim() || DEFAULT_SETTINGS.linearBaseUrl;
            await this.plugin.saveSettings();
          }),
      );

    // ── AI Summaries ───────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "AI summaries" });

    let modelDropdown: DropdownComponent;

    const updateModelOptions = (provider: "anthropic" | "openai"): void => {
      const models = provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
      modelDropdown.selectEl.empty();
      for (const { value, label } of models) {
        modelDropdown.addOption(value, label);
      }
      const validValues = models.map(m => m.value);
      if (!validValues.includes(this.plugin.settings.llmModel)) {
        this.plugin.settings.llmModel = models[0].value;
        void this.plugin.saveSettings();
      }
      modelDropdown.setValue(this.plugin.settings.llmModel);
    };

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Which AI service to use for generating roadmap card summaries.")
      .addDropdown(drop => {
        drop
          .addOption("anthropic", "Anthropic (Claude)")
          .addOption("openai", "OpenAI (GPT)")
          .setValue(this.plugin.settings.llmProvider)
          .onChange(async (value: string) => {
            this.plugin.settings.llmProvider = value as "anthropic" | "openai";
            await this.plugin.saveSettings();
            updateModelOptions(this.plugin.settings.llmProvider);
          });
      });

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Model used for summarisation. Haiku / GPT-4o mini are fastest and cheapest.")
      .addDropdown(drop => {
        modelDropdown = drop;
        updateModelOptions(this.plugin.settings.llmProvider);
        drop.onChange(async (value: string) => {
          this.plugin.settings.llmModel = value;
          await this.plugin.saveSettings();
        });
      });

    addSecretRow(
      containerEl,
      this.app,
      "AI API key",
      "sk-… or sk-ant-…",
      () => this.plugin.settings.llmSecretName,
      (n) => { this.plugin.settings.llmSecretName = n; void this.plugin.saveSettings(); },
    );

    new Setting(containerEl)
      .setName("Summary cache (hours)")
      .setDesc("How long to cache an LLM summary before regenerating it. Summaries are also invalidated when the Linear issue is updated.")
      .addSlider(slider =>
        slider
          .setLimits(1, 168, 1)
          .setValue(this.plugin.settings.summaryTtlHours)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.summaryTtlHours = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Status refresh (minutes)")
      .setDesc("How often to re-fetch the issue status from Linear. Status is kept in memory only and never written to disk.")
      .addSlider(slider =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.statusTtlMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.statusTtlMinutes = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
