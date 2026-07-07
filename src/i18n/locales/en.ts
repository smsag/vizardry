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
  "framework.sipoc-flow.description": "Same SIPOC rows as a connected flow diagram.",
  "framework.story.description":      "Release scope and priorities clear.",
  "framework.swot.description":       "Strengths, weaknesses, opportunities, and threats at a glance.",
  "framework.venn.description":       "Overlaps and gaps clearly identified.",
  "framework.vpc.description":        "Features match real customer needs.",
  "framework.wardley.description":    "Value chain plotted against evolution to reveal strategic moves.",
  "framework.pacelayers.description": "Six pace layers — Fashion to Nature — mapped with observations, feedback, and ideas.",
  "framework.conceptmap.description": "Concepts connected by labeled relationships as a directed graph.",
  "framework.ptw.description":        "Strategy defined through Winning Aspiration, Where to Play, and How to Win.",
  "framework.scqa.description":       "Situation, complication, question, answer as a narrative hierarchy.",
  "framework.scr.description":        "Situation, complication, resolution — a tighter narrative hierarchy.",

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

  // ── Pain / Opportunity / Impact Matrix ──────────────────────────────────────
  "framework.matrix.description": "Map pain points, opportunities, or impact vs. effort on a 4×4 grid.",

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

  "matrix.subtitle.pain":        "(Current State)",
  "matrix.subtitle.opportunity": "(Future State)",
  "matrix.subtitle.impact":      "(Prioritisation)",

  "matrix.legend.veryHigh": "Very High",
  "matrix.legend.high":     "High",
  "matrix.legend.medium":   "Medium",
  "matrix.legend.low":      "Low",

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
} as const;

export type TranslationKey = keyof typeof en;
