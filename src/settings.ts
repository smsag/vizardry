import type { App , DropdownComponent} from "obsidian";
import { Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type VizardryPlugin from "./main";
import { DEFAULT_SETTINGS } from "./settings-schema";
import type { SecretLinkState } from "./shared/keychain";
import { saveSecret, loadSecret, listSecrets, secretLinkState } from "./shared/keychain";
import type { SecretRowKind } from "./shared/secret-picker-model";
import { buildSecretPickerModel } from "./shared/secret-picker-model";
import { getLinearService } from "./linear";
import { getUpvotyService } from "./upvoty";
import { t } from "./i18n";

type TKey = Parameters<typeof t>[0];

function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// The persisted schema (interface, defaults, validation) lives in
// ./settings-schema so it can be loaded and unit-tested without pulling in
// Obsidian's UI classes. Re-exported here because ~10 call sites already
// import `PluginSettings` / `DEFAULT_SETTINGS` from "./settings".
export type { PluginSettings } from "./settings-schema";
export { DEFAULT_SETTINGS, normalizeSettings, serializeSettings } from "./settings-schema";

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

    // One field, two jobs: it filters the list, and anything typed that is a
    // valid id the keychain doesn't hold is offered as a name to link. Without
    // that second job a secret the listing misses — or one that does not exist
    // yet — cannot be linked from here at all.
    const search = contentEl.createEl("input", {
      cls: "vzd-secret-search",
      attr: { type: "text", placeholder: t("settings.secretPicker.searchPlaceholder") },
    });

    const listEl = contentEl.createEl("div", { cls: "vzd-secret-list" });

    let allNames: string[] = [];

    const select = (name: string, render: (filter: string) => void): void => {
      this.selected = name;
      render(search.value);
    };

    const addRow = (name: string, opts: { kind?: SecretRowKind } = {}): void => {
      const row = listEl.createEl("label", { cls: "vzd-secret-row" });
      if (name === this.selected) row.addClass("vzd-secret-row--selected");

      const radio = row.createEl("input", { attr: { type: "radio", name: "vzd-secret" } }) as HTMLInputElement;
      radio.checked = name === this.selected;

      row.createEl("span", { cls: "vzd-secret-name", text: name });
      if (opts.kind === "dangling") {
        row.createEl("span", { cls: "vzd-secret-dots vzd-secret-dots--missing", text: t("settings.secretPicker.missing") });
      } else if (opts.kind === "pending") {
        row.createEl("span", { cls: "vzd-secret-dots vzd-secret-dots--pending", text: t("settings.secretPicker.pending") });
      } else {
        row.createEl("span", { cls: "vzd-secret-dots", text: "••••••••" });
      }

      if (name === this.selected) {
        row.createEl("span", { cls: "vzd-secret-badge", text: t("settings.secretPicker.selected") });
      }

      radio.addEventListener("change", () => select(name, render));
    };

    const render = (filter: string): void => {
      listEl.empty();
      const model = buildSecretPickerModel(allNames, this.currentName, this.selected, filter);

      if (model.offer !== null) {
        const offered = model.offer;
        const useRow = listEl.createEl("button", { cls: "vzd-secret-use", text: t("settings.secretPicker.use", { name: offered }) });
        useRow.addEventListener("click", (e) => {
          e.preventDefault();
          select(offered, render);
        });
      } else if (model.invalidHint) {
        listEl.createEl("div", { cls: "vzd-secret-hint", text: t("settings.secret.invalidName") });
      }

      if (model.empty) {
        listEl.createEl("div", { cls: "vzd-secret-empty", text: t("settings.secretPicker.empty") });
      }

      for (const row of model.rows) addRow(row.name, { kind: row.kind });
    };

    render("");
    search.addEventListener("input", () => render(search.value));

    // The listing is awaited: on mobile it resolves a promise the typings
    // describe as an array, which read synchronously left the picker empty.
    void listSecrets(this.app).then(names => {
      allNames = names;
      render(search.value);
    });

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
 * Badge and description for each state a linked name can be in. The badge is a
 * pill, so it stays short; whatever needs explaining goes in the description
 * under it, which is also where the way out of a broken link belongs.
 */
const LINK_STATE: Record<SecretLinkState, { badge: TKey; cls: string; desc: TKey }> = {
  found:       { badge: "settings.secret.found",         cls: "vzd-secret-found",    desc: "settings.secret.nameDesc" },
  empty:       { badge: "settings.secret.notSet",        cls: "vzd-secret-missing",  desc: "settings.secret.nameDesc" },
  missing:     { badge: "settings.secret.badgeNoSuch",   cls: "vzd-secret-dangling", desc: "settings.secret.noSuchNameDesc" },
  invalid:     { badge: "settings.secret.badgeInvalid",  cls: "vzd-secret-dangling", desc: "settings.secret.invalidNameDesc" },
  unavailable: { badge: "settings.secret.badgeNoStore",  cls: "vzd-secret-missing",  desc: "settings.secret.unavailable" },
};

/**
 * Renders a single settings row for a secret:
 * - Displays the currently linked secret name with a badge saying what that
 *   name resolves to — including "no secret of that name", which is a broken
 *   link rather than a missing key and needs re-linking, not a new value.
 * - "Link…" button opens SecretPickerModal to choose or name a secret.
 * - Password field to enter a new value directly (creates a new secret under the current name).
 */
function addSecretRow(
  containerEl: HTMLElement,
  app: App,
  label: string,
  valuePlaceholder: string,
  defaultName: string,
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

    const paintBadge = (raw: SecretLinkState): void => {
      // Still on the name the plugin ships with and nothing stored under it:
      // that is an integration never set up, not a link that broke. Only a
      // name the user chose deserves the warning.
      const state = raw === "missing" && currentName === defaultName ? "empty" : raw;
      const spec = LINK_STATE[state];
      badge.textContent = t(spec.badge);
      badge.className = "vzd-secret-status " + spec.cls;
      setting.setDesc(t(spec.desc, { name: currentName }));
    };

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
      const syncFromStorage = (): Promise<void> =>
        secretLinkState(app, currentName).then(state => {
          paintBadge(state);
          text.setValue(state === "found" ? "••••••••" : "");
        });

      void syncFromStorage();

      text.inputEl.addEventListener("focus", () => {
        if (text.getValue() === "••••••••") {
          void loadSecret(app, currentName).then(v => text.setValue(v ?? ""));
        }
      });

      const persistValue = (): void => {
        const v = text.getValue().trim();
        if (v && v !== "••••••••") {
          void saveSecret(app, currentName, v).then(result => {
            // A rejected write used to be silent: Obsidian throws on an id it
            // will not accept, and the only trace was a console line.
            if (!result.ok) {
              new Notice(
                result.reason === "invalid-name" ? t("settings.secret.saveFailedName", { name: currentName })
                : result.reason === "unavailable" ? t("settings.secret.unavailable")
                : t("settings.secret.saveFailed", { name: currentName }),
              );
            }
            return syncFromStorage();
          });
        } else {
          void syncFromStorage();
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
      DEFAULT_SETTINGS.linearSecretName,
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
      DEFAULT_SETTINGS.llmSecretName,
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
      DEFAULT_SETTINGS.upvotySecretName,
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
