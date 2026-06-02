import type { TranslationKey } from "./en";

export const de: Partial<Record<TranslationKey, string>> = {
  // ── Framework descriptions ──────────────────────────────────────────────────
  "framework.raci.description":      "Aufgaben zugeordnet nach Verantwortlich, Rechenschaftspflichtig, Konsultiert und Informiert.",
  "framework.bmc.description":        "Das gesamte Geschäftsmodell auf einen Blick.",
  "framework.carousel.description":   "Mehrere Bilder als navigierbares Karussell.",
  "framework.fourls.description":     "Gefiel, Gelernt, Gefehlt, Gewünscht — plus eine gemeinsame Aktionsliste.",
  "framework.impact.description":     "Alle Features an Zielen ausgerichtet.",
  "framework.jobs.description":       "Kernmotivation der Kunden freigelegt.",
  "framework.kata.description":       "Klarer Weg zum nächsten Experiment.",
  "framework.lean.description":       "Riskanteste Annahmen aufgedeckt und priorisiert.",
  "framework.leanux.description":     "Team abgestimmt bevor die Entwicklung beginnt.",
  "framework.mindmap.description":    "Komplexe Ideen strukturiert und priorisiert.",
  "framework.opportunity.description":"Lösungen an echten Ergebnissen ausgerichtet.",
  "framework.ost.description":        "Ergebnis treibt Chancen, Lösungen und Experimente.",
  "framework.rac.description":        "Größte Risiken für Tests priorisiert.",
  "framework.sipoc.description":      "Prozessumfang: Lieferanten, Eingaben, Schritte, Ausgaben, Kunden.",
  "framework.sipoc-flow.description": "Prozessumfang mit expliziten Knotenformen und Flussverbindungen.",
  "framework.story.description":      "Release-Umfang und Prioritäten klar.",
  "framework.swot.description":       "Stärken, Schwächen, Chancen und Risiken auf einen Blick.",
  "framework.venn.description":       "Überschneidungen und Lücken klar erkannt.",
  "framework.vpc.description":        "Features treffen echte Kundenbedürfnisse.",
  "framework.wardley.description":    "Wertkette gegen Evolution aufgetragen zur Aufdeckung strategischer Züge.",

  // ── Canvas controls ─────────────────────────────────────────────────────────
  "controls.decreaseFontSize":  "Schriftgröße verringern",
  "controls.increaseFontSize":  "Schriftgröße vergrößern",
  "controls.copySource":        "Canvas-Quelltext kopieren",
  "controls.downloadPng":       "Als PNG herunterladen",
  "controls.presentFullscreen": "Vollbild-Präsentation",
  "controls.reloadCanvas":      "Canvas neu laden",
  "controls.exitPresentation":  "Präsentation beenden",

  // ── Navigation aria-labels ──────────────────────────────────────────────────
  "nav.previousBlock":    "Vorheriger Block",
  "nav.nextBlock":        "Nächster Block",
  "nav.previousStep":     "Vorheriger Schritt",
  "nav.nextStep":         "Nächster Schritt",
  "nav.previousImage":    "Vorheriges Bild",
  "nav.nextImage":        "Nächstes Bild",
  "nav.goToImage":        "Zu Bild {{n}} wechseln",
  "nav.imageCarousel":    "Bildkarussell, {{n}} Bilder",
  "nav.jumpTo":           "Springen zu: {{heading}}",

  // ── Inline editing ──────────────────────────────────────────────────────────
  "edit.clickToEdit": "Zum Bearbeiten klicken",
  "edit.writeFailed": "Bearbeitung konnte nicht gespeichert werden — öffne die Notiz im Bearbeitungsmodus",

  // ── Title editing ────────────────────────────────────────────────────────────
  "title.clickToEdit": "Zum Umbenennen klicken",

  // ── Impact Map level labels ─────────────────────────────────────────────────
  "impact.level.goal":        "Ziel",
  "impact.level.actor":       "Akteur",
  "impact.level.impact":      "Auswirkung",
  "impact.level.deliverable": "Lieferobjekt",

  // ── Opportunity Solution Tree level labels ──────────────────────────────────
  "ost.level.outcome":     "Ergebnis",
  "ost.level.opportunity": "Chance",
  "ost.level.solution":    "Lösung",
  "ost.level.experiment":  "Experiment",
  "ost.level.assumption":  "Annahme",

  // ── Story Map labels ────────────────────────────────────────────────────────
  "story.label.user":    "Nutzer",
  "story.label.goal":    "Ziel",
  "story.backlog":       "Backlog",

  // ── SIPOC column headers ────────────────────────────────────────────────────
  "sipoc.col.suppliers": "Lieferanten",
  "sipoc.col.inputs":    "Eingaben",
  "sipoc.col.process":   "Prozess",
  "sipoc.col.outputs":   "Ausgaben",
  "sipoc.col.customers": "Kunden",

  // ── Wardley Map labels ──────────────────────────────────────────────────────
  "wardley.stage.genesis":   "Genesis",
  "wardley.stage.custom":    "Individuell",
  "wardley.stage.product":   "Produkt",
  "wardley.stage.commodity": "Rohstoff",
  "wardley.axis.visibility": "Sichtbarkeit",
  "wardley.axis.evolution":  "Evolution →",

  // ── Commands ────────────────────────────────────────────────────────────────
  "commands.insertCanvas":         "Canvas einfügen…",
  "commands.insertVizardryCanvas": "Vizardry-Canvas einfügen…",
  "commands.insertFramework":      "{{label}} einfügen",

  // ── RACI Matrix column labels ─────────────────────────────────────────────
  "raci.col.task":        "Aufgabe",
  "raci.col.responsible": "Verantwortlich",
  "raci.col.accountable": "Rechenschaftspflichtig",
  "raci.col.consulted":   "Konsultiert",
  "raci.col.informed":    "Informiert",

  // ── Notices ─────────────────────────────────────────────────────────────────
  "notices.openMarkdownNote": "Öffne eine Markdown-Notiz im Bearbeitungsmodus, um diesen Befehl zu verwenden.",
};
