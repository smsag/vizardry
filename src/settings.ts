import type { App , DropdownComponent} from "obsidian";
import { Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type VizardryPlugin from "./main";
import { saveSecret, loadSecret, listSecrets } from "./shared/keychain";
import { getLinearService } from "./linear";
import { getUpvotyService } from "./upvoty";
import type { PrintOptions } from "./print/options";
import { DEFAULT_PRINT_OPTIONS } from "./print/options";
import { t } from "./i18n";

function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export interface PluginSettings {
  // Appearance
  /** Render canvases with a handwriting font + monochrome ink (whiteboard look). */
  sketchMode: boolean;
  /** Optional font-family override for sketch mode; blank = the bundled font. */
  sketchFont: string;

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

  // Upvoty
  upvotyEnabled: boolean;
  upvotyBaseUrl: string;
  /** Public dashboard URL used to build "Open in Upvoty" links — distinct from
   *  upvotyBaseUrl (the REST API endpoint), since self-hosted/white-labelled
   *  instances can have the two on entirely different domains. */
  upvotyAppUrl: string;
  upvotyKeyPrefix: string;
  /** Logical name under which the Upvoty API key is stored in app.secretStorage. */
  upvotySecretName: string;
  upvotyStatusTtlMinutes: number;

  // Print / PDF export
  /** Last-used options for the "Export / print note" dialog. */
  printOptions: PrintOptions;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  sketchMode: false,
  sketchFont: "",
  linearEnabled: false,
  linearBaseUrl: "https://api.linear.app/graphql",
  linearSecretName: "vzd-linear-key",
  llmProvider: "anthropic",
  llmModel: "claude-haiku-4-5-latest",
  llmSecretName: "vzd-llm-key",
  summaryTtlHours: 24,
  statusTtlMinutes: 5,
  upvotyEnabled: false,
  upvotyBaseUrl: "https://api.upvotyfeedback.com/v1",
  upvotyAppUrl: "https://app.upvoty.com/feedback",
  upvotyKeyPrefix: "UPV",
  upvotySecretName: "vzd-upvoty-key",
  upvotyStatusTtlMinutes: 5,
  printOptions: DEFAULT_PRINT_OPTIONS,
};

const ANTHROPIC_MODELS = [
  { value: "claude-haiku-4-5-latest",  label: "Claude Haiku 4.5 (fast, cheap)" },
  { value: "claude-sonnet-4-5-latest", label: "Claude Sonnet 4.5 (balanced)" },
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
    contentEl.createEl("h2", { text: t("settings.secretPicker.title") });

    // Search
    const search = contentEl.createEl("input", {
      cls: "vzd-secret-search",
      attr: { type: "text", placeholder: t("settings.secretPicker.searchPlaceholder") },
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
        listEl.createEl("div", { cls: "vzd-secret-empty", text: t("settings.secretPicker.empty") });
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
          row.createEl("span", { cls: "vzd-secret-badge", text: t("settings.secretPicker.selected") });
        }

        radio.addEventListener("change", () => {
          this.selected = name;
          listEl.querySelectorAll(".vzd-secret-row").forEach(r => r.removeClass("vzd-secret-row--selected"));
          listEl.querySelectorAll(".vzd-secret-badge").forEach(b => b.remove());
          row.addClass("vzd-secret-row--selected");
          row.createEl("span", { cls: "vzd-secret-badge", text: t("settings.secretPicker.selected") });
        });
      }
    };

    render("");
    search.addEventListener("input", () => render(search.value));

    // Footer
    const footer = contentEl.createEl("div", { cls: "vzd-secret-footer" });

    const saveBtn = footer.createEl("button", { cls: "mod-cta", text: t("settings.secretPicker.save") });
    saveBtn.addEventListener("click", () => {
      this.onSelect(this.selected);
      this.close();
    });

    const cancelBtn = footer.createEl("button", { text: t("settings.secretPicker.cancel") });
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
    setting.nameEl.empty();
    setting.setDesc(t("settings.secret.nameDesc", { name: currentName }));

    // Badge starts neutral; updated async below
    const badge = setting.nameEl.createEl("span", { cls: "vzd-secret-status vzd-secret-missing", text: "…" });
    setting.nameEl.insertBefore(badge, setting.nameEl.firstChild);
    setting.nameEl.insertBefore(document.createTextNode(label + "  "), setting.nameEl.firstChild);

    // Link button
    setting.addButton(btn => {
      btn.setButtonText(t("settings.secret.link")).onClick(() => {
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
        badge.textContent = existing ? t("settings.secret.found") : t("settings.secret.notSet");
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
              badge.textContent = stored ? t("settings.secret.found") : t("settings.secret.notSet");
              badge.className = "vzd-secret-status " + (stored ? "vzd-secret-found" : "vzd-secret-missing");
            })
          );
        } else {
          void loadSecret(app, currentName).then(stored => {
            text.setValue(stored ? "••••••••" : "");
            badge.textContent = stored ? t("settings.secret.found") : t("settings.secret.notSet");
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

    const debouncedSaveSketchFont = debounce(() => {
      this.plugin.applySketchMode();
      void this.plugin.saveSettings();
    }, 300);

    const debouncedSaveAndClearLinear = debounce(() => {
      void this.plugin.saveSettings();
      void getLinearService()?.cache.clearAndPersist();
    }, 300);

    const debouncedSave = debounce(() => {
      void this.plugin.saveSettings();
    }, 300);

    const debouncedSaveAndClearUpvoty = debounce(() => {
      void this.plugin.saveSettings();
      void getUpvotyService()?.cache.clearAndPersist();
    }, 300);

    // ── Appearance ─────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: t("settings.section.appearance") });

    new Setting(containerEl)
      .setName(t("settings.sketch.name"))
      .setDesc(t("settings.sketch.desc"))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.sketchMode)
          .onChange(async (value) => {
            this.plugin.settings.sketchMode = value;
            this.plugin.applySketchMode();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.sketchFont.name"))
      .setDesc(t("settings.sketchFont.desc"))
      .addText(text =>
        text
          .setPlaceholder("Caveat, Comic Sans MS, cursive")
          .setValue(this.plugin.settings.sketchFont)
          .onChange((value) => {
            this.plugin.settings.sketchFont = value;
            debouncedSaveSketchFont();
          }),
      );

    // ── Linear ─────────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: t("settings.section.linear") });

    new Setting(containerEl)
      .setName(t("settings.linear.enable.name"))
      .setDesc(t("settings.linear.enable.desc"))
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
      t("settings.linear.apiKey.label"),
      "lin_api_…",
      () => this.plugin.settings.linearSecretName,
      (n) => {
        this.plugin.settings.linearSecretName = n;
        void this.plugin.saveSettings();
        // Different credentials can point at a different Linear workspace —
        // stale cached titles/summaries from the old one must not linger.
        void getLinearService()?.cache.clearAndPersist();
      },
    );

    new Setting(containerEl)
      .setName(t("settings.linear.url.name"))
      .setDesc(t("settings.linear.url.desc"))
      .addText(text =>
        text
          .setPlaceholder("https://api.linear.app/graphql")
          .setValue(this.plugin.settings.linearBaseUrl)
          .onChange((value) => {
            this.plugin.settings.linearBaseUrl = value.trim() || DEFAULT_SETTINGS.linearBaseUrl;
            debouncedSaveAndClearLinear();
          }),
      );

    // ── AI Summaries ───────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: t("settings.section.ai") });

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
      .setName(t("settings.ai.provider.name"))
      .setDesc(t("settings.ai.provider.desc"))
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
      .setName(t("settings.ai.model.name"))
      .setDesc(t("settings.ai.model.desc"))
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
      t("settings.ai.apiKey.label"),
      "sk-… or sk-ant-…",
      () => this.plugin.settings.llmSecretName,
      (n) => { this.plugin.settings.llmSecretName = n; void this.plugin.saveSettings(); },
    );

    new Setting(containerEl)
      .setName(t("settings.ai.summaryCache.name"))
      .setDesc(t("settings.ai.summaryCache.desc"))
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
      .setName(t("settings.ai.statusRefresh.name"))
      .setDesc(t("settings.ai.statusRefresh.desc"))
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

    new Setting(containerEl)
      .setName(t("settings.clearCache.name"))
      .setDesc(t("settings.clearCache.linear.desc"))
      .addButton(btn =>
        btn
          .setButtonText(t("settings.clearCache.button"))
          .onClick(async () => {
            await getLinearService()?.cache.clearAndPersist();
            new Notice(t("settings.clearCache.linear.done"));
          }),
      );

    // ── Upvoty ─────────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: t("settings.section.upvoty") });

    new Setting(containerEl)
      .setName(t("settings.upvoty.enable.name"))
      .setDesc(t("settings.upvoty.enable.desc"))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.upvotyEnabled)
          .onChange(async (value) => {
            this.plugin.settings.upvotyEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    addSecretRow(
      containerEl,
      this.app,
      t("settings.upvoty.apiKey.label"),
      "upvoty_sk_…",
      () => this.plugin.settings.upvotySecretName,
      (n) => {
        this.plugin.settings.upvotySecretName = n;
        void this.plugin.saveSettings();
        // Different credentials can point at a different Upvoty board —
        // stale cached titles/summaries from the old one must not linger.
        void getUpvotyService()?.cache.clearAndPersist();
      },
    );

    new Setting(containerEl)
      .setName(t("settings.upvoty.keyPrefix.name"))
      .setDesc(t("settings.upvoty.keyPrefix.desc"))
      .addText(text =>
        text
          .setPlaceholder("UPV")
          .setValue(this.plugin.settings.upvotyKeyPrefix)
          .onChange((value) => {
            this.plugin.settings.upvotyKeyPrefix = value.trim() || "UPV";
            debouncedSave();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.upvoty.baseUrl.name"))
      .setDesc(t("settings.upvoty.baseUrl.desc"))
      .addText(text =>
        text
          .setPlaceholder("https://api.upvotyfeedback.com/v1")
          .setValue(this.plugin.settings.upvotyBaseUrl)
          .onChange((value) => {
            this.plugin.settings.upvotyBaseUrl = value.trim() || DEFAULT_SETTINGS.upvotyBaseUrl;
            debouncedSaveAndClearUpvoty();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.upvoty.appUrl.name"))
      .setDesc(t("settings.upvoty.appUrl.desc"))
      .addText(text =>
        text
          .setPlaceholder("https://app.upvoty.com/feedback")
          .setValue(this.plugin.settings.upvotyAppUrl)
          .onChange((value) => {
            this.plugin.settings.upvotyAppUrl = value.trim() || DEFAULT_SETTINGS.upvotyAppUrl;
            debouncedSave();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.upvoty.postCache.name"))
      .setDesc(t("settings.upvoty.postCache.desc"))
      .addSlider(slider =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.upvotyStatusTtlMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.upvotyStatusTtlMinutes = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.clearCache.name"))
      .setDesc(t("settings.clearCache.upvoty.desc"))
      .addButton(btn =>
        btn
          .setButtonText(t("settings.clearCache.button"))
          .onClick(async () => {
            await getUpvotyService()?.cache.clearAndPersist();
            new Notice(t("settings.clearCache.upvoty.done"));
          }),
      );
  }
}
