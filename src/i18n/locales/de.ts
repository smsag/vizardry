import type { TranslationKey } from "./en";

export const de: Partial<Record<TranslationKey, string>> = {
  // ── Framework descriptions ──────────────────────────────────────────────────
  "framework.adkar.description":     "Fünf-Stufen-Modell: Awareness, Desire, Knowledge, Ability, Reinforcement.",
  "framework.raci.description":      "Aufgaben zugeordnet nach Verantwortlich, Rechenschaftspflichtig, Konsultiert und Informiert.",
  "framework.bmc.description":        "Das gesamte Geschäftsmodell auf einen Blick.",
  "framework.carousel.description":   "Mehrere Bilder als navigierbares Karussell.",
  "framework.fourls.description":     "Gefiel, Gelernt, Gefehlt, Gewünscht — plus eine gemeinsame Aktionsliste.",
  "framework.fishbone.description":   "Ursachen bis zur Wirkung zurückverfolgt.",
  "framework.experiment.description": "Hypothese getestet, beobachtet und in eine Entscheidung überführt.",
  "framework.impact.description":     "Alle Features an Zielen ausgerichtet.",
  "framework.jobs.description":       "Kernmotivation der Kunden freigelegt.",
  "framework.kata.description":       "Klarer Weg zum nächsten Experiment.",
  "framework.lean.description":       "Riskanteste Annahmen aufgedeckt und priorisiert.",
  "framework.leanux.description":     "Team abgestimmt bevor die Entwicklung beginnt.",
  "framework.mindmap.description":    "Komplexe Ideen strukturiert und priorisiert.",
  "framework.nodemap.description":    "Boxen platziert und verbunden, genau wo du sie hinsetzt.",
  "framework.opportunity.description":"Lösungen an echten Ergebnissen ausgerichtet.",
  "framework.ost.description":        "Ergebnis treibt Chancen, Lösungen und Experimente.",
  "framework.rac.description":        "Größte Risiken für Tests priorisiert.",
  "framework.sipoc.description":      "Prozessumfang: Lieferanten, Eingaben, Schritte, Ausgaben, Kunden.",
  "framework.sipoc-flow.description": "Dieselben SIPOC-Zeilen als verbundenes Flussdiagramm.",
  "framework.story.description":      "Release-Umfang und Prioritäten klar.",
  "framework.swot.description":       "Stärken, Schwächen, Chancen und Risiken auf einen Blick.",
  "framework.venn.description":       "Überschneidungen und Lücken klar erkannt.",
  "framework.vpc.description":        "Features treffen echte Kundenbedürfnisse.",
  "framework.wardley.description":    "Wertkette gegen Evolution aufgetragen zur Aufdeckung strategischer Züge.",
  "framework.ptw.description":        "Strategie durch Gewinnaspiration, Spielfeld und Gewinnlogik definiert.",
  "framework.pacelayers.description": "Sechs Pace-Layer — von Fashion bis Nature — mit Beobachtungen, Feedback und Ideen kartiert.",
  "framework.conceptmap.description": "Konzepte durch benannte Beziehungen als gerichteter Graph verbunden.",
  "framework.scqa.description":       "Situation, Komplikation, Frage, Antwort als narrative Hierarchie.",
  "framework.scr.description":        "Situation, Komplikation, Lösung — eine kompaktere narrative Hierarchie.",

  // ── Canvas controls ─────────────────────────────────────────────────────────
  "controls.decreaseFontSize":  "Schriftgröße verringern",
  "controls.increaseFontSize":  "Schriftgröße vergrößern",
  "controls.copySource":        "Canvas-Quelltext kopieren",
  "controls.editSource":        "Quelltext bearbeiten",
  "controls.downloadPng":       "Als PNG herunterladen",
  "controls.presentFullscreen": "Vollbild-Präsentation",
  "controls.reloadCanvas":      "Canvas neu laden",
  "controls.exitPresentation":  "Präsentation beenden",
  "controls.minimize":          "Minimieren",
  "controls.expand":            "Maximieren",

  // ── Tree node editing ───────────────────────────────────────────────────────
  "tree.addChild":    "Kindknoten hinzufügen",
  "tree.deleteNode":  "Knoten löschen",
  "tree.newNode":     "Neuer Knoten",
  "tree.writeFailed": "Konnte nicht gespeichert werden — öffne die Notiz im Bearbeitungsmodus",

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
  "sipoc.addRowBelow": "Zeile darunter einfügen",
  "edit.writeFailed": "Bearbeitung konnte nicht gespeichert werden — öffne die Notiz im Bearbeitungsmodus",

  // ── Title editing ────────────────────────────────────────────────────────────
  "title.clickToEdit": "Zum Umbenennen klicken",

  // ── Fishbone Diagram level labels ───────────────────────────────────────────
  "fishbone.level.effect":   "Wirkung",
  "fishbone.level.category": "Kategorie",
  "fishbone.level.cause":    "Ursache",
  "fishbone.level.subcause": "Teilursache",

  // ── Impact Map level labels ─────────────────────────────────────────────────
  "impact.level.goal":        "Ziel",
  "impact.level.actor":       "Akteur",
  "impact.level.impact":      "Auswirkung",
  "impact.level.deliverable": "Lieferobjekt",

  // ── Opportunity Solution Tree level labels ──────────────────────────────────
  "ost.lane.outcome":      "Ergebnisraum",
  "ost.lane.opportunity":  "Chancenraum",
  "ost.lane.solution":     "Lösungsraum",
  "ost.lane.experiment":   "Experimentierraum",

  "ost.caption.need":      "Kundenbedürfnis",
  "ost.caption.pain":      "Kundenschmerzpunkt",
  "ost.caption.desire":    "Kundenwunsch",

  "ost.addBullet":         "Detail hinzufügen",

  // ── SCQA / SCR level labels ─────────────────────────────────────────────────
  "scqa.level.situation":    "Situation",
  "scqa.level.complication": "Komplikation",
  "scqa.level.question":     "Frage",
  "scqa.level.answer":       "Antwort",
  "scr.level.resolution":    "Lösung",

  // ── Story Map labels ────────────────────────────────────────────────────────
  "story.label.user":    "Nutzer",
  "story.label.goal":    "Ziel",
  "story.backlog":       "Backlog",
  "story.addTask":       "Aufgabe hinzufügen",
  "story.newTask":       "Neue Aufgabe",
  "story.deleteTask":    "Aufgabe löschen",
  "story.clickToEdit":   "Zum Bearbeiten klicken",

  // ── Customer Journey Map / Service Blueprint labels ─────────────────────────
  "journey.label.persona":     "Persona",
  "journey.label.scenario":    "Szenario",
  "journey.addCard":           "Karte hinzufügen",
  "journey.newCard":           "Neue Karte",
  "journey.deleteCard":        "Karte löschen",

  // ── SIPOC column headers ────────────────────────────────────────────────────
  "sipoc.col.suppliers": "Lieferant",
  "sipoc.col.inputs":    "Eingabe",
  "sipoc.col.process":   "Prozess",
  "sipoc.col.outputs":   "Ausgabe",
  "sipoc.col.customers": "Kunde",
  "sipoc.col.owner":     "Verantwortlicher",
  "sipoc.col.metric":    "Kennzahl",

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

  // ── Roadmap labels ───────────────────────────────────────────────────────────
  "roadmap.col.now":   "Jetzt",
  "roadmap.col.next":  "Demnächst",
  "roadmap.col.later": "Später",
  "roadmap.addItem":   "Element hinzufügen",
  "roadmap.newItem":   "Neues Element",

  // ── Roadmap Linear integration ───────────────────────────────────────────────
  "roadmap.linear.loading":    "Zusammenfassung wird geladen…",
  "roadmap.linear.error":      "Zusammenfassung konnte nicht geladen werden",
  "roadmap.linear.noSummary":  "Keine Zusammenfassung verfügbar",
  "roadmap.linear.unassigned": "Nicht zugewiesen",

  // ── Framework description ────────────────────────────────────────────────────
  "framework.roadmap.description": "Jetzt, Demnächst und Später Prioritäten auf einen Blick.",

  // ── Pain / Opportunity / Impact Matrix ──────────────────────────────────────
  "framework.matrix.description": "Schmerzpunkte, Chancen, Impact vs. Aufwand oder Annahmen auf einem 4×4-Raster.",
  "framework.scenario.description": "Zwei kritische Unsicherheiten, vier Szenarien — eine GBN/Schwartz-2×2-Matrix.",

  "matrix.row.pain.1": "Sehr großer Schmerzpunkt",
  "matrix.row.pain.2": "Großer Schmerzpunkt",
  "matrix.row.pain.3": "Kleiner Schmerzpunkt",
  "matrix.row.pain.4": "Sehr kleiner Schmerzpunkt",

  "matrix.row.opportunity.1": "Sehr großer Nutzen",
  "matrix.row.opportunity.2": "Großer Nutzen",
  "matrix.row.opportunity.3": "Kleiner Nutzen",
  "matrix.row.opportunity.4": "Sehr kleiner Nutzen",

  "matrix.row.impact.1": "Sehr hoher Impact",
  "matrix.row.impact.2": "Hoher Impact",
  "matrix.row.impact.3": "Geringer Impact",
  "matrix.row.impact.4": "Sehr geringer Impact",

  "matrix.row.assumption.1": "Sehr wichtig",
  "matrix.row.assumption.2": "Wichtig",
  "matrix.row.assumption.3": "Wenig wichtig",
  "matrix.row.assumption.4": "Sehr wenig wichtig",

  "matrix.col.pain.1": "Von allen genannt",
  "matrix.col.pain.2": "Von vielen genannt",
  "matrix.col.pain.3": "Von einigen genannt",
  "matrix.col.pain.4": "Von wenigen genannt",

  "matrix.col.opportunity.1": "Geringer Aufwand",
  "matrix.col.opportunity.2": "Mittlerer Aufwand",
  "matrix.col.opportunity.3": "Hoher Aufwand",
  "matrix.col.opportunity.4": "Sehr hoher Aufwand",

  "matrix.col.impact.1": "Sehr geringer Aufwand",
  "matrix.col.impact.2": "Geringer Aufwand",
  "matrix.col.impact.3": "Hoher Aufwand",
  "matrix.col.impact.4": "Sehr hoher Aufwand",

  "matrix.col.assumption.1": "Kein Beleg",
  "matrix.col.assumption.2": "Wenig Belege",
  "matrix.col.assumption.3": "Einige Belege",
  "matrix.col.assumption.4": "Starke Belege",

  "matrix.subtitle.pain":        "(Ist-Zustand)",
  "matrix.subtitle.opportunity": "(Soll-Zustand)",
  "matrix.subtitle.impact":      "(Priorisierung)",
  "matrix.subtitle.assumption":  "(Riskantestes zuerst testen)",

  "matrix.legend.veryHigh": "Sehr hoch",
  "matrix.legend.high":     "Hoch",
  "matrix.legend.medium":   "Mittel",
  "matrix.legend.low":      "Niedrig",

  // ── Upvoty enrichment ────────────────────────────────────────────────────────
  "upvoty.loading":          "Lädt…",
  "upvoty.noSummary":        "Keine KI-Zusammenfassung verfügbar.",
  "upvoty.votes":            "{{n}} Stimmen",
  "upvoty.error.noKey":      "Kein Upvoty-API-Schlüssel — prüfe Einstellungen → Vizardry",
  "upvoty.error.notFound":   "Beitrag nicht gefunden",
  "upvoty.error.auth":       "Upvoty: ungültiger oder fehlender API-Schlüssel",
  "upvoty.error.network":    "Upvoty: Netzwerkfehler",

  // ── Notices ─────────────────────────────────────────────────────────────────
  "notices.openMarkdownNote": "Öffne eine Markdown-Notiz im Bearbeitungsmodus, um diesen Befehl zu verwenden.",
};
