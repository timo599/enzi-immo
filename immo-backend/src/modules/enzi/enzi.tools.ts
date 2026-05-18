import type Anthropic from '@anthropic-ai/sdk'

// ─── Tool-Definitionen für Enzi ──────────────────────────────────────────────

export const ENZI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_mieter',
    description: 'Sucht Mieter nach Name oder Firma (Volltext). Gibt die ersten Treffer mit ID, Name und Adresse zurück.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchstring (Name, Firma, E-Mail oder Stadt)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_objekt',
    description: 'Sucht ein Objekt (Immobilie) nach Bezeichnung oder Adresse.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchstring (Bezeichnung, Adresse, PLZ)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_einheit',
    description: 'Sucht eine Einheit (Wohnung, Gewerbe, Büro etc.) anhand Bezeichnung. Optional auf ein Objekt eingrenzbar.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Bezeichnung der Einheit, z.B. "1.OG links" oder "EG"' },
        objektId: { type: 'string', description: 'Optional: ID des Objekts zur Eingrenzung' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_mietvertraege',
    description: 'Listet Mietverträge auf, gefiltert nach Mieter und/oder Einheit. Mindestens einer der beiden Filter sollte gesetzt sein.',
    input_schema: {
      type: 'object',
      properties: {
        mieterId:  { type: 'string', description: 'Mieter-ID (UUID)' },
        einheitId: { type: 'string', description: 'Einheit-ID (UUID)' },
      },
    },
  },
  {
    name: 'add_notiz_mieter',
    description: 'Fügt einem Mieter eine Notiz hinzu (anstelle der bestehenden Notiz oder ergänzend). Anwendung: Vermerke wie "Mieter zieht zum 31.12. aus", "neue Bankverbindung ab 2026" etc.',
    input_schema: {
      type: 'object',
      properties: {
        mieterId: { type: 'string', description: 'Mieter-ID (UUID)' },
        notiz:    { type: 'string', description: 'Der Text der Notiz' },
        modus:    { type: 'string', enum: ['ersetzen', 'anhaengen'], description: 'ersetzen = überschreibt, anhaengen = fügt mit Datum hinzu (Standard)' },
      },
      required: ['mieterId', 'notiz'],
    },
  },
  {
    name: 'add_notiz_mietvertrag',
    description: 'Fügt einem Mietvertrag eine Notiz hinzu. Beispiel: "Smart Getränke hat ab 2027 eine Mieterhöhung von 50 €" wird hier als strukturierter Vermerk gespeichert.',
    input_schema: {
      type: 'object',
      properties: {
        mietvertragId: { type: 'string', description: 'Mietvertrag-ID (UUID)' },
        notiz:         { type: 'string', description: 'Der Text der Notiz, sollte Datum + Aktion enthalten' },
        modus:         { type: 'string', enum: ['ersetzen', 'anhaengen'], description: 'Standard: anhaengen' },
      },
      required: ['mietvertragId', 'notiz'],
    },
  },
  {
    name: 'count_entities',
    description: 'Liefert die Gesamtzahlen: Objekte, Einheiten, Mieter, Mietverträge, Dokumente. Für allgemeine Übersichts-Fragen.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'help_topic',
    description: 'Gibt einen Hilfe-Text zu einem Thema. Themen: "upload", "mieter_anlegen", "vertrag_anlegen", "dokument_pruefen", "mieterhoehung", "abrechnung", "uebersicht".',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Eines der oben genannten Themen' },
      },
      required: ['topic'],
    },
  },
]

// ─── Hilfe-Texte ────────────────────────────────────────────────────────────
export const HELP_TEXTS: Record<string, string> = {
  upload: `**Dokument hochladen**

Du hast zwei Wege:

1. **Direkt zu einer Einheit/Mieter/Mietvertrag**: Öffne den Eintrag in der jeweiligen Liste, gehe zum Tab „Dokumente" und klicke auf „Hochladen".
2. **Globale Inbox**: Auf der Seite "Dokumente" → Knopf "Hochladen" oben rechts. Das ist gut für Rechnungen, die später einer Einheit zugeordnet werden.

Erlaubte Dateitypen: PDF, JPG, PNG, TIFF · max. 25 MB. Die KI extrahiert automatisch Daten und stellt sie zur Prüfung bereit.`,

  mieter_anlegen: `**Neuen Mieter anlegen**

1. Gehe auf "Mieter" in der Seitenleiste.
2. Klicke "Neuer Mieter".
3. Pflichtfeld ist **Nachname** (oder Firmenname für Gewerbemieter).
4. Optional: Vorname, E-Mail, Telefon, IBAN, Adresse, Notizen.
5. Speichern.

Der Mieter ist sofort verfügbar und kann in Mietverträgen ausgewählt werden.`,

  vertrag_anlegen: `**Neuen Mietvertrag anlegen**

1. Gehe auf "Mietverträge" → "Neuer Vertrag".
2. Wähle: Einheit, Hauptmieter, Mietart (Wohnraum/Gewerbe).
3. Vertragsbeginn + Nettomiete sind Pflicht.
4. Optional: Vertragsende, NK-Vorauszahlung, Kaution.

Wichtig: Mieter und Einheit müssen vorher angelegt sein.`,

  dokument_pruefen: `**Dokument prüfen / Review-Workflow**

Nach dem Upload analysiert die KI automatisch Rechnungen. Status wechselt von "Wartet" → "Extrahiert" → bei Unsicherheit "Prüfen!".

So prüfst du:
1. Auf "Dokumente" → Tab "Zu prüfen" zeigt offene Belege.
2. Klick "Prüfen" → Dialog zeigt extrahierte Werte.
3. Korrigiere bei Bedarf (Bearbeiten-Button).
4. Wähle eine Kostenart (Pflicht).
5. Klick "Bestätigen" — der Beleg ist verbucht.`,

  mieterhoehung: `**Mieterhöhung**

Aktuell als Notiz am Mietvertrag pflegen — die formale Berechnung-Engine ist noch in Arbeit.

So sagst du es Enzi:
- "Smart Getränke hat ab 2027 eine Mieterhöhung von 50 €" → Enzi findet den Vertrag und legt eine Notiz an.
- "Notiere bei Müller, dass die Miete ab 1.7. um 7% steigt"`,

  abrechnung: `**Nebenkostenabrechnung**

1. Lege zuerst einen Abrechnungszeitraum an (Objekt → Abrechnungszeitraum).
2. Lade alle Belege hoch und prüfe sie (Kostenart wichtig!).
3. Auf "NK-Abrechnungen" → "Berechnen" → System verteilt automatisch nach Schlüssel.
4. Nach Freigabe können Mieter-PDFs exportiert werden.`,

  uebersicht: `**Was kannst du mit Enzi machen?**

Ich kann dir helfen mit:
- **Daten finden**: "Wer wohnt in der Wollgrasweg 37?", "Welche Verträge hat Gaby Kurrle?"
- **Notizen anlegen**: "Smart Getränke hat ab 2027 eine Mieterhöhung von 50 €" → finde ich Vertrag + lege Notiz an.
- **Hilfe geben**: "Wie lade ich ein Dokument hoch?", "Wie lege ich einen Mietvertrag an?"
- **Übersicht geben**: Anzahl Objekte/Einheiten/Mieter usw.

Sprich einfach mit mir wie mit einem Kollegen.`,
}
