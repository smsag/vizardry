/**
 * English base translations — source of truth for all keys.
 *
 * Rules:
 * - Keys use dot-notation: category.subcategory.name
 * - Interpolation slots use {{varName}} syntax
 * - Framework names and block labels are NOT translated (they are part
 *   of the user-authored DSL and must stay English for note portability)
 */
export const en = {
  // ── Framework descriptions (shown in the insert modal) ─────────────────────
  "framework.adkar.description":     "Five-step change model: Awareness, Desire, Knowledge, Ability, Reinforcement.",
  "framework.raci.description":      "Tasks mapped to who is Responsible, Accountable, Consulted, and Informed.",
  "framework.bmc.description":        "Whole business model made visible.",
  "framework.carousel.description":   "Multiple images as a navigable carousel.",
  "framework.fourls.description":     "Liked, Learned, Lacked, Longed for — plus a shared action list.",
  "framework.fishbone.description":   "Root causes traced back to an effect.",
  "framework.experiment.description": "Hypothesis tested, observed, and turned into a decision.",
  "framework.errc.description":       "Blue Ocean Four Actions: Eliminate, Reduce, Raise, Create.",
  "framework.impact.description":     "All features tied to goals.",
  "framework.jobs.description":       "Core customer motivation laid bare.",
  "framework.kata.description":       "Clear path to next experiment.",
  "framework.lean.description":       "Riskiest assumptions exposed and ranked.",
  "framework.leanux.description":     "Team aligned before building starts.",
  "framework.mindmap.description":    "Complex ideas structured and prioritised.",
  "framework.nodemap.description":    "Boxes placed and connected exactly where you put them.",
  "framework.opportunity.description":"Solutions tied to real outcomes.",
  "framework.ost.description":        "Outcome drives opportunities, solutions, and experiments.",
  "framework.rac.description":        "Biggest risks ranked for testing.",
  "framework.sipoc.description":      "Process scope: suppliers, inputs, steps, outputs, customers.",
  "framework.sipoc-flow.description": "Same SIPOC rows as a connected flow diagram.",
  "framework.story.description":      "Release scope and priorities clear.",
  "framework.swot.description":       "Strengths, weaknesses, opportunities, and threats at a glance.",
  "framework.futureself.description": "Where you are, where you want to be, and the actions to get there in a set period.",
  "framework.venn.description":       "Overlaps and gaps clearly identified.",
  "framework.vpc.description":        "Features match real customer needs.",
  "framework.wardley.description":    "Value chain plotted against evolution to reveal strategic moves.",
  "framework.pacelayers.description": "Six pace layers — Fashion to Nature — mapped with observations, feedback, and ideas.",
  "framework.conceptmap.description": "Concepts connected by labeled relationships as a directed graph.",
  "framework.ptw.description":        "Strategy defined through Winning Aspiration, Where to Play, and How to Win.",
  "framework.scqa.description":       "Situation, complication, question, answer as a narrative hierarchy.",
  "framework.scr.description":        "Situation, complication, resolution — a tighter narrative hierarchy.",
  "framework.journey.description":    "Phases mapped against actions, feelings, and pain points — expandable into a full service blueprint.",
  "framework.service-blueprint.description": "Customer journey plus frontstage, backstage, and support-process lanes.",
  "framework.wheeloflife.description": "Life areas scored 0–10 as a segmented wheel — balance at a glance.",
  "framework.odyssey.description": "Three five-year life plans side by side — timeline, dashboard, and open questions.",
  "framework.circleofinfluence.description": "Sort what you care about into Concern, Influence, and Control — and focus inward.",
  "framework.wholeperson.description": "Body, Mind, Heart, and Spirit scored on a wheel with renewal activities.",
  "framework.radar.description": "Rate several attributes 0–10 and plot them as a filled radar/spider chart.",
  "framework.strategycanvas.description": "Blue Ocean value curves — competing factors scored 0–10 for you vs. rivals.",
  "framework.utilitymap.description": "Blue Ocean 6×6 map — where your offering creates buyer utility (or pain).",

  // ── Canvas controls ─────────────────────────────────────────────────────────
  "controls.decreaseFontSize":  "Decrease font size",
  "controls.increaseFontSize":  "Increase font size",
  "controls.copySource":        "Copy canvas source",
  "controls.editSource":        "Edit source",
  "controls.downloadPng":       "Download as PNG",
  "controls.presentFullscreen": "Present fullscreen",
  "controls.reloadCanvas":      "Reload canvas",
  "controls.exitPresentation":  "Exit presentation",
  "controls.minimize":          "Minimize",
  "controls.expand":            "Expand",

  // ── Tree node editing ───────────────────────────────────────────────────────
  "tree.addChild":   "Add child node",
  "tree.deleteNode": "Delete node",
  "tree.newNode":    "New Node",
  "tree.writeFailed": "Could not save — open the note in editing mode",

  // ── Navigation aria-labels ──────────────────────────────────────────────────
  "nav.previousBlock":    "Previous block",
  "nav.nextBlock":        "Next block",
  "nav.previousStep":     "Previous step",
  "nav.nextStep":         "Next step",
  "nav.previousImage":    "Previous image",
  "nav.nextImage":        "Next image",
  "nav.goToImage":        "Go to image {{n}}",
  "nav.imageCarousel":    "Image carousel, {{n}} images",
  "nav.jumpTo":           "Jump to: {{heading}}",
  "nav.jumpToCanvas":     "Jump to canvas: {{title}}",
  "nav.canvasNotFound":   "No canvas titled \"{{title}}\" in this note",

  // ── Inline editing ──────────────────────────────────────────────────────────
  "edit.clickToEdit":  "Click to edit",
  "sipoc.addRowBelow": "Add row below",
  "edit.writeFailed":  "Edit could not be saved — open the note in editing mode",

  // ── Title editing ────────────────────────────────────────────────────────────
  "title.clickToEdit": "Click to rename",

  // ── Fishbone Diagram level labels ───────────────────────────────────────────
  "fishbone.level.effect":   "Effect",
  "fishbone.level.category": "Category",
  "fishbone.level.cause":    "Cause",
  "fishbone.level.subcause": "Sub-cause",

  // ── Impact Map level labels ─────────────────────────────────────────────────
  "impact.level.goal":        "Goal",
  "impact.level.actor":       "Actor",
  "impact.level.impact":      "Impact",
  "impact.level.deliverable": "Deliverable",

  // ── Opportunity Solution Tree swim-lane labels ──────────────────────────────
  "ost.lane.outcome":      "Outcome space",
  "ost.lane.opportunity":  "Opportunity Space",
  "ost.lane.solution":     "Solution Space",
  "ost.lane.experiment":   "Experimentation Space",

  // ── Opportunity Solution Tree opportunity captions (per keyword) ─────────────
  "ost.caption.need":      "Customer need",
  "ost.caption.pain":      "Customer pain point",
  "ost.caption.desire":    "Customer desire",

  // Add-bullet affordance inside an OST node
  "ost.addBullet":         "Add detail",

  // ── SCQA / SCR level labels ─────────────────────────────────────────────────
  "scqa.level.situation":    "Situation",
  "scqa.level.complication": "Complication",
  "scqa.level.question":     "Question",
  "scqa.level.answer":       "Answer",
  "scr.level.resolution":    "Resolution",

  // ── Story Map labels ────────────────────────────────────────────────────────
  "story.label.user":    "User",
  "story.label.goal":    "Goal",
  "story.backlog":       "Backlog",
  "story.addTask":       "Add task",
  "story.newTask":       "New Task",
  "story.deleteTask":    "Delete task",
  "story.clickToEdit":   "Click to edit",

  // ── SIPOC column headers ────────────────────────────────────────────────────
  "sipoc.col.suppliers": "Supplier",
  "sipoc.col.inputs":    "Input",
  "sipoc.col.process":   "Process",
  "sipoc.col.outputs":   "Output",
  "sipoc.col.customers": "Customer",
  "sipoc.col.owner":     "Owner",
  "sipoc.col.metric":    "Metric",

  // ── Customer Journey Map / Service Blueprint labels ─────────────────────────
  "journey.label.persona":     "Persona",
  "journey.label.scenario":    "Scenario",
  "journey.addCard":           "Add card",
  "journey.newCard":           "New Card",
  "journey.deleteCard":        "Delete card",

  // ── Wardley Map labels ──────────────────────────────────────────────────────
  "wardley.stage.genesis":   "Genesis",
  "wardley.stage.custom":    "Custom",
  "wardley.stage.product":   "Product",
  "wardley.stage.commodity": "Commodity",
  "wardley.axis.visibility": "Visibility",
  "wardley.axis.evolution":  "Evolution →",

  // ── Commands ────────────────────────────────────────────────────────────────
  "commands.insertCanvas":           "Insert canvas…",
  "commands.insertVizardryCanvas":   "Insert Vizardry canvas…",
  "commands.insertFramework":        "Insert {{label}}",

  // ── RACI Matrix column labels ─────────────────────────────────────────────
  "raci.col.task":        "Task",
  "raci.col.responsible": "Responsible",
  "raci.col.accountable": "Accountable",
  "raci.col.consulted":   "Consulted",
  "raci.col.informed":    "Informed",

  // ── Roadmap labels ───────────────────────────────────────────────────────────
  "roadmap.col.now":   "Now",
  "roadmap.col.next":  "Next",
  "roadmap.col.later": "Later",
  "roadmap.addItem":   "Add item",
  "roadmap.newItem":   "New Item",

  // ── Odyssey labels ───────────────────────────────────────────────────────────
  "odyssey.questions": "Questions",

  // ── Period header field ──────────────────────────────────────────────────────
  "period.label":       "Period",
  "period.placeholder": "Set period",

  // ── Circle of Influence labels ───────────────────────────────────────────────
  "coi.concern":   "Concern",
  "coi.influence": "Influence",
  "coi.control":   "Control",

  // ── Roadmap Linear integration ───────────────────────────────────────────────
  "roadmap.linear.loading":    "Loading summary…",
  "roadmap.linear.error":      "Could not load summary",
  "roadmap.linear.noSummary":  "No summary available",
  "roadmap.linear.unassigned": "Unassigned",

  // ── Framework description ────────────────────────────────────────────────────
  "framework.roadmap.description": "Now, Next, and Later priorities at a glance.",

  // ── Pain / Opportunity / Impact Matrix ──────────────────────────────────────
  "framework.matrix.description": "Two tick axes form a cell grid; place items as cards freely or in cells. Presets: pain, opportunity, impact, assumption, scenario.",
  "framework.scenario.description": "Two critical uncertainties, four scenarios — a GBN/Schwartz 2×2.",

  "matrix.item.detailsPlaceholder": "Add details…",

  "matrix.row.pain.1": "Very Major Pain",
  "matrix.row.pain.2": "Major Pain",
  "matrix.row.pain.3": "Minor Pain",
  "matrix.row.pain.4": "Very Minor Pain",

  "matrix.row.opportunity.1": "Very Major Benefit",
  "matrix.row.opportunity.2": "Major Benefit",
  "matrix.row.opportunity.3": "Minor Benefit",
  "matrix.row.opportunity.4": "Very Minor Benefit",

  "matrix.row.impact.1": "Very High Impact",
  "matrix.row.impact.2": "High Impact",
  "matrix.row.impact.3": "Low Impact",
  "matrix.row.impact.4": "Very Low Impact",

  "matrix.row.assumption.1": "Very High Importance",
  "matrix.row.assumption.2": "High Importance",
  "matrix.row.assumption.3": "Low Importance",
  "matrix.row.assumption.4": "Very Low Importance",

  "matrix.col.pain.1": "Mentioned by Everyone",
  "matrix.col.pain.2": "Mentioned by Many",
  "matrix.col.pain.3": "Mentioned by Some",
  "matrix.col.pain.4": "Mentioned by Few",

  "matrix.col.opportunity.1": "Low Level of Effort",
  "matrix.col.opportunity.2": "Medium Level of Effort",
  "matrix.col.opportunity.3": "High Level of Effort",
  "matrix.col.opportunity.4": "Very High Level of Effort",

  "matrix.col.impact.1": "Very Low Effort",
  "matrix.col.impact.2": "Low Effort",
  "matrix.col.impact.3": "High Effort",
  "matrix.col.impact.4": "Very High Effort",

  "matrix.col.assumption.1": "No Evidence",
  "matrix.col.assumption.2": "Little Evidence",
  "matrix.col.assumption.3": "Some Evidence",
  "matrix.col.assumption.4": "Strong Evidence",

  "matrix.subtitle.pain":        "(Current State)",
  "matrix.subtitle.opportunity": "(Future State)",
  "matrix.subtitle.impact":      "(Prioritisation)",
  "matrix.subtitle.assumption":  "(Test Riskiest First)",

  // Preset axis titles (the tick labels reuse matrix.row.* / matrix.col.*)
  "matrix.axis.pain.x":        "Prevalence",
  "matrix.axis.pain.y":        "Severity",
  "matrix.axis.opportunity.x": "Effort",
  "matrix.axis.opportunity.y": "Benefit",
  "matrix.axis.impact.x":      "Effort",
  "matrix.axis.impact.y":      "Impact",
  "matrix.axis.assumption.x":  "Evidence",
  "matrix.axis.assumption.y":  "Importance",
  "matrix.axis.scenario.x":    "Uncertainty A",
  "matrix.axis.scenario.y":    "Uncertainty B",
  "matrix.scenario.low":       "Low",
  "matrix.scenario.high":      "High",

  // ── Upvoty enrichment ────────────────────────────────────────────────────────
  "upvoty.loading":          "Loading…",
  "upvoty.noSummary":        "No AI summary available.",
  "upvoty.votes":            "{{n}} votes",
  "upvoty.error.noKey":      "No Upvoty API key — check Settings → Vizardry",
  "upvoty.error.notFound":   "Post not found",
  "upvoty.error.auth":       "Upvoty: invalid or missing API key",
  "upvoty.error.network":    "Upvoty: network error",

  // ── Notices ─────────────────────────────────────────────────────────────────
  "notices.openMarkdownNote": "Open a Markdown note in editing mode to use this command.",

  // ── Settings: secret picker + secret row ────────────────────────────────────
  "settings.secretPicker.title":         "Select secret",
  "settings.secretPicker.searchPlaceholder": "Search secrets…",
  "settings.secretPicker.empty":         "No secrets stored yet.",
  "settings.secretPicker.selected":      "Selected",
  "settings.secretPicker.save":          "Save",
  "settings.secretPicker.cancel":        "Cancel",
  "settings.secret.nameDesc":            "Secret name: {{name}}",
  "settings.secret.found":               "Key found ✓",
  "settings.secret.notSet":              "Not set",
  "settings.secret.link":                "Link…",

  // ── Settings: Linear section ────────────────────────────────────────────────
  "settings.section.appearance":         "Appearance",
  "settings.sketch.name":                "Sketch (hand-drawn) style",
  "settings.sketch.desc":                "Render canvases with a handwriting font and monochrome ink, with a subtle hand-drawn wobble — like a whiteboard sketch.",
  "settings.sketchFont.name":            "Handwriting font (optional)",
  "settings.sketchFont.desc":            "Font family to use in sketch mode. Leave blank for the built-in handwriting font.",
  "settings.section.linear":             "Linear",
  "settings.linear.enable.name":         "Enable Linear integration",
  "settings.linear.enable.desc":         "Show issue status on roadmap cards and generate AI summaries on hover.",
  "settings.linear.apiKey.label":        "Linear API key",
  "settings.linear.url.name":            "Linear GraphQL URL",
  "settings.linear.url.desc":            "Change only if you are using a self-hosted Linear instance.",

  // ── Settings: AI summaries section ──────────────────────────────────────────
  "settings.section.ai":                 "AI summaries",
  "settings.ai.provider.name":           "Provider",
  "settings.ai.provider.desc":           "Which AI service to use for generating roadmap card summaries.",
  "settings.ai.model.name":              "Model",
  "settings.ai.model.desc":              "Model used for summarisation. Haiku / GPT-4o mini are fastest and cheapest.",
  "settings.ai.apiKey.label":            "AI API key",
  "settings.ai.summaryCache.name":       "Summary cache (hours)",
  "settings.ai.summaryCache.desc":       "How long to cache an LLM summary before regenerating it. Summaries are also invalidated when the Linear issue is updated.",
  "settings.ai.statusRefresh.name":      "Status refresh (minutes)",
  "settings.ai.statusRefresh.desc":      "How often to re-fetch the issue status from Linear. Status is kept in memory only and never written to disk.",

  // ── Settings: Upvoty section ────────────────────────────────────────────────
  "settings.section.upvoty":             "Upvoty",
  "settings.upvoty.enable.name":         "Enable Upvoty integration",
  "settings.upvoty.enable.desc":         "Show feature request details and AI summaries on hover for UPV-1234 keys.",
  "settings.upvoty.apiKey.label":        "Upvoty API key",
  "settings.upvoty.keyPrefix.name":      "Key prefix",
  "settings.upvoty.keyPrefix.desc":      "The prefix used to identify Upvoty posts inline, e.g. UPV matches UPV-1234.",
  "settings.upvoty.baseUrl.name":        "Upvoty API base URL",
  "settings.upvoty.baseUrl.desc":        "Change only if you are on a self-hosted or white-labelled Upvoty instance.",
  "settings.upvoty.appUrl.name":         "Upvoty dashboard URL",
  "settings.upvoty.appUrl.desc":         "Used to build \"Open in Upvoty\" links. Change only if you are on a self-hosted or white-labelled Upvoty instance — this is usually a different domain than the API base URL above.",
  "settings.upvoty.postCache.name":      "Post cache (minutes)",
  "settings.upvoty.postCache.desc":      "How long to cache a fetched Upvoty post before re-fetching.",

  // ── Settings: clear-cache rows ──────────────────────────────────────────────
  "settings.clearCache.name":            "Clear cached summaries",
  "settings.clearCache.button":          "Clear",
  "settings.clearCache.linear.desc":     "Discard all persisted Linear summaries so they are regenerated on next hover. Frees space in the plugin's data file.",
  "settings.clearCache.linear.done":     "Vizardry: Linear summary cache cleared.",
  "settings.clearCache.upvoty.desc":     "Discard all persisted Upvoty summaries so they are regenerated on next hover. Frees space in the plugin's data file.",
  "settings.clearCache.upvoty.done":     "Vizardry: Upvoty summary cache cleared.",

  // ── Service (Linear/Upvoty) user-facing error + notice strings ──────────────
  "service.error.keyLookupFailed":       "Key lookup failed: {{message}}",
  "service.error.noLinearKey":           "No Linear API key — check Settings → Vizardry (secret: \"{{secret}}\")",
  "service.error.noUpvotyKey":           "No Upvoty API key — check Settings → Vizardry (secret: \"{{secret}}\")",
  "service.error.noUpvotyKeyShort":      "No Upvoty API key — check Settings → Vizardry",
  "service.error.noAiKey":               "No AI API key — check Settings → Vizardry (secret: \"{{secret}}\")",
  "service.error.upvotyDisabled":        "Upvoty integration disabled.",
  "service.notice.linearAuth":           "Vizardry: Linear API key is invalid or missing — check Settings → Vizardry.",
  "service.notice.upvotyAuth":           "Vizardry: Upvoty API key is invalid or missing — check Settings → Vizardry.",
} as const;

export type TranslationKey = keyof typeof en;
