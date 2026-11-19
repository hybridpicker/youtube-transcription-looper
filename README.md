# Transkriptions-Looper

Eine lokale Chrome-Erweiterung zum Heraushören und Transkribieren. Sie besteht aus zwei Teilen:

- **YouTube-Looper**: ein Bedienfeld direkt neben dem YouTube-Video mit präzisem A/B-Loop, Zeitlupe, Transposition, Klangfilter, Live-Tonanzeige und gespeicherten Stellen.
- **Transkriptions-Werkstatt** für Audiodateien: dieselben Werkzeuge mit echter Wellenform und samplegenauen Loops.

Alles läuft im Browser auf diesem Gerät. Es wird nichts hochgeladen oder aufgezeichnet.

## Installation

1. Öffne `chrome://extensions` in Chrome.
2. Aktiviere oben rechts den **Entwicklermodus**.
3. Klicke auf **Entpackte Erweiterung laden** und wähle diesen Ordner aus.
4. Hefte das Symbol der Erweiterung in der Symbolleiste an.

Nach einer Änderung an der Erweiterung genügt in `chrome://extensions` ein Klick auf das Aktualisieren-Symbol. Bereits geöffnete YouTube-Tabs danach am besten einmal neu laden.

## YouTube-Looper

Auf einer YouTube-Videoseite das Symbol der Erweiterung anklicken: Das Bedienfeld erscheint rechts neben dem Video, sodass Bild und Regler gleichzeitig sichtbar sind, und bleibt beim Scrollen stehen. Es bleibt für weitere Videos geöffnet, bis du es mit `×` schließt.

Der Knopf `⬓` in der Kopfzeile setzt das Bedienfeld stattdessen breit unter das Video (und `◨` wieder zurück). Im Kinomodus und in schmalen Fenstern ohne Seitenleiste landet es automatisch unter dem Video. Jeder Abschnitt (Tempo, Tonhöhe, Klang, Töne, Stellen) lässt sich mit einem Klick auf seine Überschrift einklappen. Auf jeder anderen Seite öffnet das Symbol die Werkstatt für Audiodateien.

| Bereich | Was er kann |
| --- | --- |
| Zeitleiste | Klick springt, Ziehen zieht einen Loop auf, die Griffe A/B lassen sich verschieben. Ein neuer Loop wird automatisch herangezoomt; **Alles** zeigt wieder das ganze Video, `Strg`/`⌘` + Mausrad zoomt frei. Die Wellenform entsteht beim Abspielen und zeigt, was du schon gehört hast. |
| Loop | Um die eigene Länge weiter/zurück springen, halbieren, verdoppeln, Grenzen fein verschieben, Pause zwischen den Durchläufen. `✕` entfernt den Loop. |
| Tempo | 10–200 % bei gleicher Tonhöhe, auch unter YouTubes Grenze von 25 %. Ein Klick auf die Prozentzahl setzt auf 100 % zurück. |
| Tonhöhe | ±12 Halbtöne und Feinstimmung in Cent, unabhängig vom Tempo. |
| Klang | Kanalwahl (links, rechts, Mono, Mitte entfernt) und Frequenzbereich, z. B. nur Bass. |
| Takte | Taktraster in der Zeitleiste mit Taktnummern; Loop-Grenzen rasten auf Schläge und Takte ein, und ein Loop lässt sich direkt als „Takt 5 bis 8“ setzen. |
| Stellen | Marker (**+ Marker**) und gespeicherte Loops (**+ Loop**) mit Namen, pro Video gemerkt. |
| Töne | Zeigt live über einer Klaviatur, welche Töne klingen, und schätzt den Akkord. Ein Klick auf eine Taste spielt den Ton zum Vergleich. |

Loop, Tempo, Tonhöhe und Stellen werden pro Video gespeichert.

Die Tastenkürzel sind dieselben wie in der Werkstatt (siehe unten, ohne die Notizfeld-Kürzel). Solange das Bedienfeld offen ist, haben sie Vorrang vor YouTubes eigenen Tasten; der Knopf **Tasten** schaltet das aus.

### Takte markieren

Der Abschnitt **Takte** ist anfangs eingeklappt; ein Klick auf die Überschrift öffnet ihn.

1. **Tempo festlegen:** Video laufen lassen und im Takt auf **Tippen** klicken (oder `T` drücken), mindestens zwei, besser acht Schläge. Alternativ das Tempo als BPM eintragen. Das funktioniert auch bei verlangsamter Wiedergabe; das Tempo bezieht sich immer auf das Original.
2. **Eins setzen:** An der ersten Zählzeit von Takt 1 auf **1 hier** klicken (oder `X`). Mit `◂` `▸` lässt sich das Raster um 10 ms verschieben (`Shift`: 50 ms).
3. **Taktart:** Schläge pro Takt wählen (Standard 4).

Danach zeigt die Zeitleiste Taktstriche mit Nummern statt Zeiten, beim Hineinzoomen auch die Schläge, und oben rechts im Abschnitt steht der aktuelle Takt und Schlag. Loop-Grenzen rasten beim Ziehen und bei `A`/`B` ein; `Alt` beim Ziehen schaltet das Einrasten aus, **Raster** (`G`) blendet alles aus. Ein Loop, der auf Taktgrenzen liegt, springt mit `,` und `.` taktweise weiter.

Das Raster ist gleichmäßig. Bei Aufnahmen mit schwankendem Tempo läuft es mit der Zeit auseinander; dann die Eins am jeweiligen Abschnitt neu setzen.

### So funktioniert die Klangbearbeitung

Für Zeitlupe und Transposition wird der Ton des Videos durch einen eigenen Phase-Vocoder geleitet statt durch Chromes eingebaute Tempokorrektur. Das klingt bei langsamen Tempi deutlich sauberer, bringt aber eine kleine Verzögerung des Tons gegenüber dem Bild mit (etwa 0,1 s, bei sehr langsamem Tempo bis 0,35 s). Bei 100 % und Originaltonhöhe läuft der Ton unverändert und ohne Verzögerung.

### Hinweise

- Die Klangbearbeitung startet erst nach dem ersten Klick auf die Seite, weil Chrome Tonverarbeitung ohne Nutzeraktion nicht erlaubt. Bis dahin funktionieren Loop und Tempo bereits.
- Beim Sprung zum Loop-Anfang macht der YouTube-Player eine winzige Pause. Für nahtlose, samplegenaue Loops ist die Werkstatt mit einer Audiodatei besser geeignet.
- Während Werbung greift der Looper nicht ein.
- Im Vollbildmodus ist das Bedienfeld nicht sichtbar; Loop und Tastenkürzel laufen weiter.
- Wird die Erweiterung neu geladen, während ein YouTube-Tab offen ist, den Tab neu laden.

## Transkriptions-Werkstatt (Audiodateien)

Öffnen: Erweiterungs-Symbol auf einer beliebigen Nicht-YouTube-Seite anklicken, oder im YouTube-Bedienfeld **Audiodatei …**. Danach eine Datei in das Fenster ziehen (MP3, WAV, FLAC, M4A, OGG; auch Videodateien mit Tonspur).

| Bereich | Was er kann |
| --- | --- |
| Wellenform | Klick springt, Ziehen zieht einen Loop auf, die Griffe A/B lassen sich verschieben. Mausrad zoomt, seitliches Wischen verschiebt. Die Leiste darüber zeigt die ganze Datei. |
| Loop | Samplegenaue Grenzen ohne Knackser. Um die eigene Länge weiter/zurück springen, halbieren, verdoppeln, Pause zwischen den Durchläufen. |
| Tempo | 10–200 % bei gleicher Tonhöhe. Bei 100 % und Originaltonhöhe wird die Datei unverändert abgespielt. |
| Tonhöhe | ±12 Halbtöne und Feinstimmung in Cent, unabhängig vom Tempo. |
| Klang | Kanalwahl (links, rechts, Mono, Mitte entfernt) und Frequenzbereich, z. B. nur Bass. |
| Töne | Zeigt über einer Klaviatur, welche Töne an der Abspielposition klingen, und schätzt den Akkord. Ein Klick auf eine Taste spielt den Ton zum Vergleich. |
| Stellen | Marker und gespeicherte Loops mit Namen; Aufruf per Klick oder Zifferntaste. |
| Notizen | Textfeld pro Datei mit Zeitmarken, Export als Textdatei. Der aktuelle Loop lässt sich als WAV speichern. |

Loop, Tempo, Marker und Notizen werden pro Datei gemerkt. Die zuletzt geöffnete Datei wird beim nächsten Start wieder geladen (lokal im Browserspeicher der Erweiterung).

### Tastenkürzel

| Taste | Funktion |
| --- | --- |
| `Leertaste` | Wiedergabe / Pause |
| `Enter` | Zum Loop-Anfang springen und abspielen |
| `←` `→` | 1 s zurück / vor (`Shift`: 5 s, `Alt`: 0,1 s) |
| `A` `B` | Loop-Anfang / -Ende an der Abspielposition |
| `L` | Loop ein / aus |
| `,` `.` | Loop um seine Länge zurück / weiter |
| `H` `D` | Loop halbieren / verdoppeln |
| `Q` `W` / `E` `R` | Loop-Anfang / Loop-Ende früher / später (`Shift`: grob) |
| `↑` `↓` | Tempo ±5 % |
| `+` `−` | Tonhöhe ±1 Halbton |
| `M` / `S` | Marker setzen / Loop speichern |
| `1`–`9` | Gespeicherte Stelle aufrufen |
| `Z` / `F` | Auf den Loop zoomen / ganze Datei zeigen |

Im Notizfeld: `Shift`+`Leertaste` Start/Pause, `Shift`+`Enter` zum Loop-Anfang, `Alt`+`T` Zeitmarke.

### Hinweise

- Die Akkordanzeige ist eine Schätzung aus dem Spektrum und kann durch Obertöne danebenliegen. Unter etwa A1 ist die Tonauflösung grob.
- Sehr lange Dateien brauchen viel Arbeitsspeicher, weil sie vollständig dekodiert werden (etwa 25 MB pro Stereo-Minute).
- Ohne Erweiterung lässt sich die Werkstatt auch über einen lokalen Webserver öffnen: im Projektordner `python3 -m http.server 8791` starten und `http://localhost:8791/app/` aufrufen. Ein Doppelklick auf `index.html` genügt nicht.

### Aufbau

| Datei | Inhalt |
| --- | --- |
| `youtube/content.js`, `youtube/panel-css.js` | YouTube-Bedienfeld (Content-Script, Shadow DOM) |
| `background.js` | Symbol-Klick: Bedienfeld umschalten oder Werkstatt öffnen |
| `app/vocoder.js` | Phase-Vocoder mit Phase-Locking, gemeinsam für beide Teile |
| `app/live-core.js`, `app/live-worklet.js` | Live-Tonhöhenwandler für den YouTube-Ton |
| `app/stretch-core.js` | Datei-Wiedergabe: Zeitdehnung, Resampler, samplegenaue Loop-Logik |
| `shared/common.js` | Gemeinsame Helfer (Zeitformat, Notennamen, Akkordschätzung) |
| `legacy-v1/` | Die ursprüngliche Version der Erweiterung als Sicherung |
| `app/stretch-worklet.js`, `app/engine.js` | AudioWorklet und Anbindung an Web Audio |
| `app/analysis.js`, `app/fft.js` | Wellenform-Daten, Notenspektrum, Akkordschätzung, WAV-Export |
| `app/app.js`, `app/index.html`, `app/app.css` | Oberfläche |
