import type { TranslationKey } from "./en";

export const de: Partial<Record<TranslationKey, string>> = {
  // ── Framework descriptions ──────────────────────────────────────────────────
  "framework.adkar.description":     "Fünf-Stufen-Modell: Awareness, Desire, Knowledge, Ability, Reinforcement.",
  "framework.raci.description":      "Aufgaben zugeordnet nach Verantwortlich, Rechenschaftspflichtig, Konsultiert und Informiert.",
  "framework.bmc.description":        "Das gesamte Geschäftsmodell auf einen Blick.",
  "framework.carousel.description":   "Mehrere Bilder als navigierbares Karussell.",
  "framework.fourls.description":     "Gefiel, Gelernt, Gefehlt, Gewünscht — plus eine gemeinsame Aktionsliste.",
  "framework.fishbone.description":   "Ursachen bis zur Wirkung zurückverfolgt.",
  "framework.fishbone-6m.description": "Fishbone mit den 6M-Kategorien der Fertigung vorbelegt.",
  "framework.fishbone-service.description": "Fishbone mit den 4S-Kategorien für Services vorbelegt.",
  "framework.fishbone-marketing.description": "Fishbone mit den 7P-Kategorien für Marketing vorbelegt.",
  "framework.experiment.description": "Hypothese getestet, beobachtet und in eine Entscheidung überführt.",
  "framework.errc.description":       "Blue-Ocean-Vier-Aktionen: Eliminieren, Reduzieren, Steigern, Schaffen.",
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
  "framework.futureself.description": "Wo du stehst, wo du hinwillst und die Aktionen dorthin in einem festen Zeitraum.",
  "framework.venn.description":       "Überschneidungen und Lücken klar erkannt.",
  "framework.vpc.description":        "Features treffen echte Kundenbedürfnisse.",
  "framework.wardley.description":    "Wertkette gegen Evolution aufgetragen zur Aufdeckung strategischer Züge.",
  "framework.ptw.description":        "Strategie durch Gewinnaspiration, Spielfeld und Gewinnlogik definiert.",
  "framework.pacelayers.description": "Sechs Pace-Layer — von Fashion bis Nature — mit Beobachtungen, Feedback und Ideen kartiert.",
  "framework.conceptmap.description": "Konzepte durch benannte Beziehungen als gerichteter Graph verbunden.",
  "framework.scqa.description":       "Situation, Komplikation, Frage, Antwort als narrative Hierarchie.",
  "framework.scr.description":        "Situation, Komplikation, Lösung — eine kompaktere narrative Hierarchie.",
  "framework.journey.description":    "Phasen abgebildet auf Aktionen, Gefühle und Schmerzpunkte — erweiterbar zu einer vollständigen Service Blueprint.",
  "framework.service-blueprint.description": "Customer Journey plus Frontstage-, Backstage- und Support-Prozess-Bahnen.",
  "framework.wheeloflife.description": "Lebensbereiche von 0–10 als segmentiertes Rad — Balance auf einen Blick.",
  "framework.odyssey.description": "Drei Fünf-Jahres-Lebenspläne nebeneinander — Zeitleiste, Dashboard und offene Fragen.",
  "framework.circleofinfluence.description": "Sortiere deine Themen in Sorge, Einfluss und Kontrolle — und richte den Fokus nach innen.",
  "framework.wholeperson.description": "Körper, Verstand, Herz und Geist als Rad bewertet, mit Erneuerungs-Aktivitäten.",
  "framework.radar.description": "Mehrere Attribute von 0–10 bewerten und als gefülltes Radar-/Spinnendiagramm darstellen.",
  "framework.strategycanvas.description": "Blue-Ocean-Wertkurven — Wettbewerbsfaktoren von 0–10 für dich vs. Konkurrenz.",
  "framework.utilitymap.description": "Blue-Ocean-6×6-Karte — wo dein Angebot Käufernutzen (oder Schmerz) schafft.",

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
  "controls.pin":               "Canvas beim Scrollen oben anheften",
  "controls.unpin":             "Canvas lösen",

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
  "nav.jumpToCanvas":     "Zur Canvas springen: {{title}}",
  "nav.canvasNotFound":   "Keine Canvas mit dem Titel \"{{title}}\" in dieser Notiz",

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
  "commands.exportPrint":          "Notiz exportieren / drucken (mit Visualisierungen)…",

  // ── Druck-/PDF-Export-Dialog ─────────────────────────────────────────────────
  "print.title":            "Notiz exportieren / drucken",
  "print.noFile":           "Öffne zuerst eine Markdown-Notiz.",
  "print.print":            "Drucken / PDF speichern",
  "print.cancel":           "Abbrechen",
  "print.previewFailed":    "Vorschau konnte nicht gerendert werden.",
  "print.pageCount":        "{{n}} Seiten",
  "print.pageCountOne":     "1 Seite",
  "print.templateOptions":  "Vorlagenoptionen",
  "print.notice.failed":    "Vizardry: Export fehlgeschlagen — siehe Entwicklerkonsole.",
  "print.notice.inProgress": "Ein Export läuft bereits.",

  "print.opt.template":            "Vorlage",
  "print.opt.pageSize":            "Seitengröße",
  "print.opt.landscape":           "Querformat",
  "print.opt.margins":             "Ränder",
  "print.opt.showTitle":           "Titel anzeigen",
  "print.opt.h1Break":             "Jede Überschrift 1 auf neuer Seite beginnen",
  "print.opt.h1BreakDesc":         "Jede oberste Überschrift beginnt eine neue Seite.",
  "print.opt.h2Break":             "Jede Überschrift 2 auf neuer Seite beginnen",
  "print.opt.pageNumbers":         "Seitenzahlen",
  "print.opt.pageNumberPosition":  "Position der Seitenzahl",
  "print.opt.runningHeader":       "Kopfzeile",
  "print.opt.runningHeaderDesc":   "Notiztitel im Seitenrand wiederholen.",

  "print.margins.narrow": "Schmal",
  "print.margins.normal": "Normal",
  "print.margins.wide":   "Breit",

  "print.pageNumbers.none":     "Keine",
  "print.pageNumbers.plain":    "1, 2, 3",
  "print.pageNumbers.pageN":    "Seite 1",
  "print.pageNumbers.nOfTotal": "1 von N",

  "print.position.bottomCenter": "Unten mittig",
  "print.position.bottomRight":  "Unten rechts",
  "print.position.bottomLeft":   "Unten links",
  "print.position.topRight":     "Oben rechts",
  "print.position.topCenter":    "Oben mittig",

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
  "odyssey.questions": "Fragen",
  "period.label":       "Zeitraum",
  "period.placeholder": "Zeitraum festlegen",
  "coi.concern":   "Sorge",
  "coi.influence": "Einfluss",
  "coi.control":   "Kontrolle",
  "roadmap.newItem":   "Neues Element",

  // ── Roadmap Linear integration ───────────────────────────────────────────────
  "roadmap.linear.loading":    "Zusammenfassung wird geladen…",
  "roadmap.linear.error":      "Zusammenfassung konnte nicht geladen werden",
  "roadmap.linear.noSummary":  "Keine Zusammenfassung verfügbar",
  "roadmap.linear.unassigned": "Nicht zugewiesen",

  // ── Framework description ────────────────────────────────────────────────────
  "framework.roadmap.description": "Jetzt, Demnächst und Später Prioritäten auf einen Blick.",

  // ── Pain / Opportunity / Impact Matrix ──────────────────────────────────────
  "framework.matrix.description": "Zwei Achsen mit Ticks bilden ein Zellraster; Elemente als Karten frei oder in Zellen platzieren. Presets: pain, opportunity, impact, assumption, scenario.",

  "matrix.axis.pain.x":        "Verbreitung",
  "matrix.axis.pain.y":        "Schweregrad",
  "matrix.axis.opportunity.x": "Aufwand",
  "matrix.axis.opportunity.y": "Nutzen",
  "matrix.axis.impact.x":      "Aufwand",
  "matrix.axis.impact.y":      "Impact",
  "matrix.axis.assumption.x":  "Belege",
  "matrix.axis.assumption.y":  "Wichtigkeit",
  "matrix.axis.scenario.x":    "Unsicherheit A",
  "matrix.axis.scenario.y":    "Unsicherheit B",
  "matrix.scenario.low":       "Niedrig",
  "matrix.scenario.high":      "Hoch",
  "framework.scenario.description": "Zwei kritische Unsicherheiten, vier Szenarien — eine GBN/Schwartz-2×2-Matrix.",

  "matrix.item.detailsPlaceholder": "Details hinzufügen…",

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

  // ── Settings: secret picker + secret row ────────────────────────────────────
  "settings.secretPicker.title":         "Geheimnis auswählen",
  "settings.secretPicker.searchPlaceholder": "Geheimnisse durchsuchen…",
  "settings.secretPicker.empty":         "Noch keine Geheimnisse gespeichert.",
  "settings.secretPicker.selected":      "Ausgewählt",
  "settings.secretPicker.save":          "Speichern",
  "settings.secretPicker.cancel":        "Abbrechen",
  "settings.secret.nameDesc":            "Geheimnisname: {{name}}",
  "settings.secret.found":               "Schlüssel gefunden ✓",
  "settings.secret.notSet":              "Nicht gesetzt",
  "settings.secret.link":                "Verknüpfen…",

  // ── Settings: Linear section ────────────────────────────────────────────────
  "settings.section.appearance":         "Darstellung",
  "settings.sketch.name":                "Skizzen-Stil (handgezeichnet)",
  "settings.sketch.desc":                "Canvases mit Handschrift-Font und monochromer Tinte darstellen, mit leichtem handgezeichnetem Wackeln — wie eine Whiteboard-Skizze.",
  "settings.sketchFont.name":            "Handschrift-Font (optional)",
  "settings.sketchFont.desc":            "Schriftfamilie für den Skizzen-Modus. Leer lassen für den eingebauten Handschrift-Font.",
  "settings.section.linear":             "Linear",
  "settings.linear.enable.name":         "Linear-Integration aktivieren",
  "settings.linear.enable.desc":         "Zeigt den Issue-Status auf Roadmap-Karten und erzeugt beim Überfahren KI-Zusammenfassungen.",
  "settings.linear.apiKey.label":        "Linear-API-Schlüssel",
  "settings.linear.url.name":            "Linear-GraphQL-URL",
  "settings.linear.url.desc":            "Nur ändern, wenn du eine selbst gehostete Linear-Instanz verwendest.",

  // ── Settings: AI summaries section ──────────────────────────────────────────
  "settings.section.ai":                 "KI-Zusammenfassungen",
  "settings.ai.provider.name":           "Anbieter",
  "settings.ai.provider.desc":           "Welcher KI-Dienst zum Erzeugen der Roadmap-Karten-Zusammenfassungen verwendet wird.",
  "settings.ai.model.name":              "Modell",
  "settings.ai.model.desc":              "Modell für die Zusammenfassung. Haiku / GPT-4o mini sind am schnellsten und günstigsten.",
  "settings.ai.apiKey.label":            "KI-API-Schlüssel",
  "settings.ai.summaryCache.name":       "Zusammenfassungs-Cache (Stunden)",
  "settings.ai.summaryCache.desc":       "Wie lange eine KI-Zusammenfassung zwischengespeichert wird, bevor sie neu erzeugt wird. Zusammenfassungen werden außerdem ungültig, wenn das Linear-Issue aktualisiert wird.",
  "settings.ai.statusRefresh.name":      "Status-Aktualisierung (Minuten)",
  "settings.ai.statusRefresh.desc":      "Wie oft der Issue-Status von Linear neu abgerufen wird. Der Status wird nur im Arbeitsspeicher gehalten und nie auf die Festplatte geschrieben.",

  // ── Settings: Upvoty section ────────────────────────────────────────────────
  "settings.section.upvoty":             "Upvoty",
  "settings.upvoty.enable.name":         "Upvoty-Integration aktivieren",
  "settings.upvoty.enable.desc":         "Zeigt beim Überfahren Details zu Feature-Requests und KI-Zusammenfassungen für UPV-1234-Schlüssel.",
  "settings.upvoty.apiKey.label":        "Upvoty-API-Schlüssel",
  "settings.upvoty.keyPrefix.name":      "Schlüssel-Präfix",
  "settings.upvoty.keyPrefix.desc":      "Das Präfix zur Erkennung von Upvoty-Beiträgen im Text, z. B. UPV passt auf UPV-1234.",
  "settings.upvoty.baseUrl.name":        "Upvoty-API-Basis-URL",
  "settings.upvoty.baseUrl.desc":        "Nur ändern, wenn du eine selbst gehostete oder white-labeled Upvoty-Instanz nutzt.",
  "settings.upvoty.appUrl.name":         "Upvoty-Dashboard-URL",
  "settings.upvoty.appUrl.desc":         "Wird zum Erstellen von \"In Upvoty öffnen\"-Links verwendet. Nur ändern, wenn du eine selbst gehostete oder white-labeled Upvoty-Instanz nutzt — dies ist üblicherweise eine andere Domain als die API-Basis-URL oben.",
  "settings.upvoty.postCache.name":      "Beitrags-Cache (Minuten)",
  "settings.upvoty.postCache.desc":      "Wie lange ein abgerufener Upvoty-Beitrag zwischengespeichert wird, bevor er neu abgerufen wird.",

  // ── Settings: clear-cache rows ──────────────────────────────────────────────
  "settings.clearCache.name":            "Zwischengespeicherte Zusammenfassungen löschen",
  "settings.clearCache.button":          "Löschen",
  "settings.clearCache.linear.desc":     "Verwirft alle gespeicherten Linear-Zusammenfassungen, sodass sie beim nächsten Überfahren neu erzeugt werden. Gibt Platz in der Datendatei des Plugins frei.",
  "settings.clearCache.linear.done":     "Vizardry: Linear-Zusammenfassungs-Cache geleert.",
  "settings.clearCache.upvoty.desc":     "Verwirft alle gespeicherten Upvoty-Zusammenfassungen, sodass sie beim nächsten Überfahren neu erzeugt werden. Gibt Platz in der Datendatei des Plugins frei.",
  "settings.clearCache.upvoty.done":     "Vizardry: Upvoty-Zusammenfassungs-Cache geleert.",

  // ── Service (Linear/Upvoty) user-facing error + notice strings ──────────────
  "service.error.keyLookupFailed":       "Schlüsselabruf fehlgeschlagen: {{message}}",
  "service.error.noLinearKey":           "Kein Linear-API-Schlüssel — prüfe Einstellungen → Vizardry (Geheimnis: \"{{secret}}\")",
  "service.error.noUpvotyKey":           "Kein Upvoty-API-Schlüssel — prüfe Einstellungen → Vizardry (Geheimnis: \"{{secret}}\")",
  "service.error.noUpvotyKeyShort":      "Kein Upvoty-API-Schlüssel — prüfe Einstellungen → Vizardry",
  "service.error.noAiKey":               "Kein KI-API-Schlüssel — prüfe Einstellungen → Vizardry (Geheimnis: \"{{secret}}\")",
  "service.error.upvotyDisabled":        "Upvoty-Integration deaktiviert.",
  "service.notice.linearAuth":           "Vizardry: Linear-API-Schlüssel ist ungültig oder fehlt — prüfe Einstellungen → Vizardry.",
  "service.notice.upvotyAuth":           "Vizardry: Upvoty-API-Schlüssel ist ungültig oder fehlt — prüfe Einstellungen → Vizardry.",
};
