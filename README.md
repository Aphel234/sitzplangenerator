# Sitzplatzgenerator

Eine lokale Web-App zur automatischen Erstellung von Sitzplänen mit Regeln.

## Start

1. Den Ordner entpacken.
2. `index.html` per Doppelklick im Browser öffnen.
3. Klasse, Raum und Fach eintragen, den Raum konfigurieren, Schüler übernehmen, Regeln hinzufügen und „Sitzplan erzeugen“ wählen.

Es ist kein Server nötig. Die Daten bleiben im Browser und werden zusätzlich im lokalen Speicher des Browsers gesichert.

## Speichern

- **Klasse, Raum und Fach** werden gemeinsam mit Raum, Schülerliste, Regeln und Sitzplan gespeichert.
- Über **Projekt speichern** wird eine JSON-Datei erzeugt.
- Der Dateiname enthält – soweit eingetragen – Klasse, Fach und Raum, zum Beispiel `Sitzplan_7b_Mathematik_B204.json`.
- Bereits mit der vorherigen Version gespeicherte Projektdateien können weiterhin geladen werden.

## Unterstützte Regeln

- direkt nebeneinander (nur links/rechts)
- nicht direkt nebeneinander
- Mindestabstand / nicht in der Nähe
- möglichst weit auseinander
- vorne sitzen
- hinten sitzen
- alleine sitzen (abhängig von Einzelplatz oder Doppeltisch)
- fester Sitzplatz für einen bestimmten Schüler
- allgemeine Mischung nach frei definierbarer Kategorie

## Bedienung

- Plätze können durch Anklicken gesperrt oder aktiviert werden.
- Belegte Plätze können per Drag-and-drop getauscht werden.
- Fest zugewiesene Schüler und ihre reservierten Plätze sind mit einer Stecknadel markiert und können nicht versehentlich verschoben werden.
- Projekte lassen sich als JSON speichern und wieder laden.

## Feste Sitzplätze

Unter **Regeln** lässt sich „muss auf einem festen Platz sitzen“ auswählen. Danach werden Schüler und Sitzplatz fest miteinander verbunden. Der Generator setzt diese Person bei jeder neuen Berechnung zuerst auf den ausgewählten Platz und verändert die Zuweisung während der Optimierung nicht. Derselbe Schüler kann nicht zweimal fixiert werden und ein Platz kann nicht mehreren Schülern zugewiesen werden.

## Druckausgaben

- **Raumansicht drucken:** Tafel oben, wie in der normalen Bearbeitungsansicht.
- **Lehreransicht drucken:** Blick vom Lehrertisch in Richtung Klasse; erste Reihe unten, Reihen und Spalten passend zur Blickrichtung gedreht.
- **Klassenbuch drucken:** A4-Hochformat mit einem kompakten Sitzplanfeld von etwa 125 mm Höhe, also etwas weniger als einer halben A4-Seite. Die Darstellung nutzt ebenfalls die Lehrerperspektive und enthält Klasse, Raum, Fach und Datum.

Alle Druckansichten können im Druckdialog des Browsers auch als PDF gespeichert werden.

## Grundprinzipien

- Unterschiedliche Kategorien möglichst nebeneinander
- Gleiche Kategorien möglichst nebeneinander
- Möglichst jeder soll einen direkten Nachbarn haben
- Freie Plätze möglichst von vorne nach hinten füllen
- Einzelne Lücken in Reihen vermeiden

Die beiden Kategorie-Prinzipien schließen sich gegenseitig aus. Alle Nachbarschaftsprinzipien beziehen sich auf direkte linke/rechte Nachbarplätze. Bei Doppeltischen zählt ausschließlich der Partnerplatz desselben Tisches. Schüler mit der Muss-Regel **„muss alleine sitzen“** sind vom Prinzip „möglichst jeder soll einen Nachbarn haben“ ausgenommen.

## Einzelplätze und Doppeltische

Unter **Klassenraum → Sitzmöbel** lässt sich zwischen Einzelplätzen und Doppeltischen/Zweierbänken wählen. Bei Doppeltischen werden die Plätze jeder Reihe paarweise von links zusammengefasst; bei einer ungeraden Spaltenzahl bleibt der letzte Platz ein Einzelplatz. Regeln wie „direkt nebeneinander“ beziehen sich bei Doppeltischen nur auf die beiden Plätze desselben Tisches.

Die Muss-Regel **„muss alleine sitzen“** bedeutet:

- bei Doppeltischen: Der zweite Platz desselben Tisches bleibt frei,
- bei Einzelplätzen: Links und rechts direkt daneben darf niemand sitzen.


## Druckkorrektur

- Klassenbuch-Druckansicht ohne zusätzliche Leerseite


## Lokalen Browserstand löschen

Über **„Lokale Projektdaten löschen“** kann der automatisch im Browser gespeicherte aktuelle Stand vollständig entfernt werden. Vor dem Löschen erscheint eine Sicherheitsabfrage. Danach startet die Anwendung mit einem leeren Standardprojekt neu. Bereits über **„Projekt speichern“** exportierte JSON-Dateien auf dem Rechner werden dabei nicht gelöscht und können jederzeit wieder über **„Projekt laden“** geöffnet werden.
