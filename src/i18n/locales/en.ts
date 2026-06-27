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
  "framework.impact.description":     "All features tied to goals.",
  "framework.jobs.description":       "Core customer motivation laid bare.",
  "framework.kata.description":       "Clear path to next experiment.",
  "framework.lean.description":       "Riskiest assumptions exposed and ranked.",
  "framework.leanux.description":     "Team aligned before building starts.",
  "framework.mindmap.description":    "Complex ideas structured and prioritised.",
  "framework.opportunity.description":"Solutions tied to real outcomes.",
  "framework.ost.description":        "Outcome drives opportunities, solutions, and experiments.",
  "framework.rac.description":        "Biggest risks ranked for testing.",
  "framework.sipoc.description":      "Process scope: suppliers, inputs, steps, outputs, customers.",
  "framework.sipoc-flow.description": "Process scope with explicit node shapes and flow connections.",
  "framework.story.description":      "Release scope and priorities clear.",
  "framework.swot.description":       "Strengths, weaknesses, opportunities, and threats at a glance.",
  "framework.venn.description":       "Overlaps and gaps clearly identified.",
  "framework.vpc.description":        "Features match real customer needs.",
  "framework.wardley.description":    "Value chain plotted against evolution to reveal strategic moves.",
  "framework.pacelayers.description": "Six pace layers — Fashion to Nature — mapped with observations, feedback, and ideas.",
  "framework.conceptmap.description": "Concepts connected by labeled relationships as a directed graph.",
  "framework.ptw.description":        "Strategy defined through Winning Aspiration, Where to Play, and How to Win.",

  // ── Canvas controls ─────────────────────────────────────────────────────────
  "controls.decreaseFontSize":  "Decrease font size",
  "controls.increaseFontSize":  "Increase font size",
  "controls.copySource":        "Copy canvas source",
  "controls.editSource":        "Edit source",
  "controls.downloadPng":       "Download as PNG",
  "controls.presentFullscreen": "Present fullscreen",
  "controls.reloadCanvas":      "Reload canvas",
  "controls.exitPresentation":  "Exit presentation",

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

  // ── Opportunity Solution Tree level labels ──────────────────────────────────
  "ost.level.outcome":     "Outcome",
  "ost.level.opportunity": "Opportunity",
  "ost.level.solution":    "Solution",
  "ost.level.experiment":  "Experiment",
  "ost.level.assumption":  "Assumption",

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

  // ── Roadmap Linear integration ───────────────────────────────────────────────
  "roadmap.linear.loading":    "Loading summary…",
  "roadmap.linear.error":      "Could not load summary",
  "roadmap.linear.noSummary":  "No summary available",
  "roadmap.linear.unassigned": "Unassigned",

  // ── Framework description ────────────────────────────────────────────────────
  "framework.roadmap.description": "Now, Next, and Later priorities at a glance.",

  // ── Notices ─────────────────────────────────────────────────────────────────
  "notices.openMarkdownNote": "Open a Markdown note in editing mode to use this command.",
} as const;

export type TranslationKey = keyof typeof en;
