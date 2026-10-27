# Spieleregal

Meine All-Time-Favoriten als Regal: Konsole wählen, Regal öffnet sich, Spiel herausziehen.
Reines HTML/CSS/JS ohne Framework und Build-Schritt.

## Ansehen

```bash
node tools/serve.mjs
```

Dann http://localhost:8642 öffnen. Doppelklick auf `index.html` geht auch, nur die Google-Schrift braucht Internet.

## 3D-Regal (experimentell)

`3d/` ist die WebGL/WebGPU-Version: Nussbaum-Regal mit Spiegelung, Hüllen mit dem Rücken nach vorn, zum Herausziehen anklicken.
Läuft nur über den Server (http://localhost:8642/3d/), nicht per Doppelklick. Teilt Daten, Cover und Sammlungsstatus mit Version 1.

- three.js 0.186.1 (WebGPU-Renderer, Fallback WebGL 2) per Import Map vom CDN, kein Build-Schritt
- `3d/systems.js`: Verpackungsmaße und Rückendesign pro System
- `3d/textures.js`: Holz und Hüllenrücken, prozedural per Canvas
- `3d/main.js`: Szene, Licht, Spiegelung, Interaktion, Effekte

Bedienung: Klick zieht ein Spiel heraus, Ziehen dreht die Hülle, ← → blättert, Esc stellt zurück.

## Ein Spiel hinzufügen

1. In `data/games.js` eine Zeile ergänzen, zum Beispiel:
   ```js
   { "title": "Spyro the Dragon", "system": "PS1", "year": 1998, "developer": "Insomniac Games", "publisher": "Sony", "genre": "Jump ’n’ Run", "owned": false, "note": "", "wiki": "Spyro the Dragon (video game)" },
   ```
   - `system`: `SNES`, `N64`, `PS1`, `DC`, `PS2`, `X360`, `PS4`, `PS5` oder `PC`
   - `wiki`: Titel des englischen Wikipedia-Artikels (für Cover-Fallback und deutschen Text)
   - optional `steam`: Steam-App-ID (PC-Cover im Hochformat)
   - optional `libretro`: abweichender Name im libretro-Archiv, z. B. `["Wave Race 64 - Kawasaki Jet Ski"]`
2. Cover und Beschreibung holen:
   ```bash
   node tools/fetch.mjs
   ```
   Es werden nur fehlende Einträge geholt. Ein einzelnes Spiel neu holen: `node tools/fetch.mjs spyro`, alles neu: `--force`.

Das Skript braucht Node 18+, `cwebp` (`brew install webp`) und `sips` (macOS).

## Sammlung & Erinnerungen

Den Schalter „In meiner Sammlung“ und das Feld „Meine Erinnerung“ speichert der Browser.
Mit **Liste exportieren** lädst du eine aktualisierte `games.js` herunter. Ersetze damit `data/games.js`,
dann ist alles dauerhaft gesichert und gilt auch auf anderen Geräten.

## Dateien

| Pfad | Inhalt |
|---|---|
| `data/games.js` | Deine Liste, wird von Hand gepflegt |
| `data/meta.js` | Cover-Infos und Texte, vom Skript erzeugt |
| `covers/sm`, `covers/lg` | WebP-Cover, 240 px fürs Regal und 600 px für die Detailansicht |
| `tools/fetch.mjs` | Abrufskript |
| `tools/serve.mjs` | Mini-Server für die lokale Vorschau |

## Quellen

Cover von libretro-thumbnails (Retro, PAL/DE bevorzugt), Steam (PC) und Wikipedia.
Texte aus der deutschen Wikipedia (CC BY-SA), wo es keinen deutschen Artikel gibt, aus der englischen.
Cover sind urheberrechtlich geschützt. Für eine öffentliche Seite deshalb einen Zugangsschutz verwenden (z. B. `.htaccess` mit Basic Auth).
