import { App, PluginSettingTab, Setting } from "obsidian";
import type VizardryPlugin from "./main";
import { saveSecret, loadSecret } from "./shared/keychain";

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
  llmModel: "claude-haiku-20240307",
  llmSecretName: "vzd-llm-key",
  summaryTtlHours: 24,
  statusTtlMinutes: 5,
};

const ANTHROPIC_MODELS = [
  { value: "claude-haiku-20240307",      label: "Claude Haiku (fast, cheap)" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude Sonnet (balanced)" },
];

const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini (fast, cheap)" },
  { value: "gpt-4o",      label: "GPT-4o (balanced)" },
];

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

    new Setting(containerEl)
      .setName("Linear API key")
      .setDesc("Stored in the OS keychain via Obsidian's secure storage (never written to data.json).")
      .addText(text => {
        text
          .setPlaceholder("lin_api_…")
          .setValue("••••••••")
          .inputEl.setAttribute("type", "password");

        // Reveal actual value on focus
        text.inputEl.addEventListener("focus", () => {
          if (text.getValue() === "••••••••") {
            loadSecret(this.app, this.plugin.settings.linearSecretName).then(v => {
              text.setValue(v ?? "");
            });
          }
        });

        // Persist to OS keychain and re-mask on blur
        text.inputEl.addEventListener("blur", () => {
          const v = text.getValue().trim();
          if (v && v !== "••••••••") {
            void saveSecret(this.app, this.plugin.settings.linearSecretName, v);
          }
          text.setValue("••••••••");
        });

        // Show empty field when no key is stored yet
        loadSecret(this.app, this.plugin.settings.linearSecretName).then(v => {
          if (!v) text.setValue("");
        });
      });

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

    // modelDropdown is assigned inside the addDropdown callback below;
    // TypeScript needs a concrete type rather than the deep infer pattern.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let modelDropdown: any;

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

    new Setting(containerEl)
      .setName("AI API key")
      .setDesc("Stored in the OS keychain via Obsidian's secure storage (never written to data.json).")
      .addText(text => {
        text
          .setPlaceholder("sk-… or sk-ant-…")
          .setValue("••••••••")
          .inputEl.setAttribute("type", "password");

        text.inputEl.addEventListener("focus", () => {
          if (text.getValue() === "••••••••") {
            loadSecret(this.app, this.plugin.settings.llmSecretName).then(v => {
              text.setValue(v ?? "");
            });
          }
        });

        text.inputEl.addEventListener("blur", () => {
          const v = text.getValue().trim();
          if (v && v !== "••••••••") {
            void saveSecret(this.app, this.plugin.settings.llmSecretName, v);
          }
          text.setValue("••••••••");
        });

        loadSecret(this.app, this.plugin.settings.llmSecretName).then(v => {
          if (!v) text.setValue("");
        });
      });

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
