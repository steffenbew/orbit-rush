# Audio-Quellen

Die Audiodateien werden lokal aus `assets/audio/` abgespielt; es gibt keine Audio-Tracking- oder Streaming-Dienste.

## Zielerfassungs-Bestätigung

- `lock-on.wav`: eigens für Orbit Rush synthetisierter Zweiklang, keine externen Samples.
- Zwei kurze Sinustöne mit 540 und 720 Hz, weicher Ein-/Ausblendung und exponentiellem Ausklang; 160 ms, mono PCM-WAV, 16 Bit/44,1 kHz.
- Feste Tonhöhe, Gain 0,19; einmalige, leise Bestätigung beim Einrasten eines Ziels.

## Aktuelle Laser-, Leermagazin-, Treffer- und Explosionssounds

**Sci-Fi Sounds (1.0)** von **Kenney**

- Quelle: https://opengameart.org/content/sci-fi-sounds
- Originalpaket: https://opengameart.org/sites/default/files/sci-fi_sounds.zip
- Lizenz: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Original-Lizenzdatei: `assets/audio/KENNEY-LICENSE.txt`
- Checkpoint bestanden (Demo W4, Original-Sweep): `checkpoint-pass.wav` aus `Audio/forceField_001.ogg`, ursprünglicher Sweep des früheren streifenden Außenwandkontakts. WAV-Konvertierung mit 44,1 kHz, keine zusätzlichen Filter, Schnitte oder Tonhöhenänderungen. Feste Tonhöhe, Gain 0,157083; gegenüber dem vorherigen Gain 0,14 nochmals um 1 dB angehoben.
- Außenwandkontakte verwenden jetzt ausschließlich `shield-hard.wav` aus `Audio/forceField_000.ogg` (WAV-Konvertierung mit 44,1 kHz, keine weiteren Effekte); feste Tonhöhe, Gain 0,19 (streifend) bzw. 0,24 (hart). Auswahl nach eingehender Normalgeschwindigkeit an der Außenwand: ab 150 hart (15 bei reduzierter Bewegung), darunter streifend. Schaden und Kontakt-Cooldown unverändert.
- Aktiver Lasersound: `laser-soft.mp3`, abgeleitet von `Audio/laserRetro_000.ogg`, zusätzlich mit 1,5-kHz-Tiefpass bearbeitet. Leiser Mix und feste Abspielgeschwindigkeit 0,9; kein Variantenwechsel.
- Leermagazin-Klick: `empty-click.wav`, erste 120 ms von `Audio/impactMetal_000.ogg`, 400-Hz-Hochpass, 2,4-kHz-Tiefpass, Ausklang von 40–120 ms, Lautstärke zunächst auf 70 %, anschließend Dynamikkompression (Schwelle 0,045, Verhältnis 4:1, Attack 0,1 ms, Release 20 ms, Makeup ×5) und +2 dB für einen besser hörbaren Klangkörper; mono PCM-WAV mit 44,1 kHz. Im Spiel mit fester Tonhöhe und Gain 0,28 abgespielt.
- `impact-1.mp3`, `impact-2.mp3`, `impact-3.mp3`: `Audio/impactMetal_000.ogg`, `Audio/impactMetal_001.ogg`, `Audio/impactMetal_003.ogg`
- `blast-1.mp3`, `blast-2.mp3`, `blast-3.mp3`: `Audio/explosionCrunch_000.ogg`, `Audio/explosionCrunch_002.ogg`, `Audio/explosionCrunch_004.ogg`
- Änderungen: MP3-Konvertierung (44,1 kHz), Lautstärkeangleichung mit FFmpeg loudnorm (-18 LUFS Zielwert). Variable Abspielgeschwindigkeit/Tonhöhe im Spiel.
- Explosionen: Basis-Gain 0,55 mit Variantenfaktoren 0,8 / 0,75 / 1,4 für `blast-1.mp3` / `blast-2.mp3` / `blast-3.mp3`; rein abspielseitiger Lautstärkeabgleich, keine erneute Dateibearbeitung.
- Treffer und Explosionen: je drei Varianten, keine unmittelbar wiederholte Variante. Größere Schiffe explodieren mit tieferer Tonhöhe. Der Laser verwendet nur einen gleichbleibenden Sound.

## Checkpoint-, Combo-Sound und Kollisionsalarm

**Space shooter sound effects** von **dravenx (Dravenx)**

- Quelle: https://opengameart.org/content/space-shooter-sound-effects
- Originalpaket: https://opengameart.org/sites/default/files/sounds_1.zip
- Lizenz: **Creative Commons Attribution 3.0 Unported (CC BY 3.0)**
- Lizenztext: https://creativecommons.org/licenses/by/3.0/
- `go-bing.wav`: `sounds/buttonselect/6.wav`, unverändert übernommen. Einmaliger Bestätigungston beim Erscheinen von „LOS!“ / „GO!“ nach dem Training; feste Tonhöhe, Gain 0,124775 (gegenüber dem vorherigen Gain 0,14 nochmals 1 dB leiser).
- `reward.wav`: `sounds/powerups/1.wav`
- Checkpoint verfehlt (Demo M1): `checkpoint-miss.wav` aus `sounds/misc/error.wav`; ersetzt nur den Checkpoint-Trefferton, nicht die normalen Kollisionstreffer.
- Checkpoint-Fehlton: mono PCM-WAV mit 44,1 kHz, FFmpeg `loudnorm=I=-20:TP=-3:LRA=7`, keine zusätzlichen Schnitte oder Tonhöhenänderungen. Feste Tonhöhe, Gain 0,34 im Spiel; unverändert.
- `warning-low.wav`: aus `sounds/misc/alarm.wav`. Erste 0,65 Sekunden verwendet, auf 85 % der ursprünglichen Tonhöhe/Abspielgeschwindigkeit abgesenkt, auf 44,1 kHz resampelt, 800-Hz-Tiefpass, Lautstärke auf 65 %, Schnittkanten mit 3/5 ms geglättet. Dauer ca. 0,765 Sekunden; im Spiel mit Ruhepause alle 0,95 Sekunden wiederholt.
- `reward.wav` wurde unverändert übernommen; Lautstärke wird im Spiel angepasst.

## Aktuelle Hintergrundmusik

**Retro Game Music Pack · Level 1** von **Juhani Junkala (SubspaceAudio)**

- Quelle: https://opengameart.org/content/5-chiptunes-action
- Sammlung: „5 Action Chiptunes By Juhani Junkala“
- Original: `Juhani Junkala [Retro Game Music Pack] Level 1.wav`
- Lokal: `assets/audio/orbit-arcade.mp3`
- Lizenz: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Original-Lizenzhinweis: `assets/audio/MUSIC-LICENSE.txt`
- Änderungen: Tiefpass bei 11 kHz, Lautstärkeangleichung (-18 LUFS Zielwert), MP3-Konvertierung. Im Spiel leise als Loop unter den Effekten abgespielt.

Die Quellen und Lizenzlinks der aktiven Sounds sind zusätzlich im Spiel über „Audio-Credits“ zugänglich.

## Phosphor Icons

- Phosphor Icons (`@phosphor-icons/core` 2.1.1), https://phosphoricons.com/
- Originalpaket: https://registry.npmjs.org/@phosphor-icons/core/-/core-2.1.1.tgz
- Regular-SVGs für die Oberfläche, einschließlich Rakete, Maus, Ton, Pause, Vollbild und Ergebnissymbole. Die Rakete wird auch als Favicon verwendet.
- Unveränderte SVG-Pfade als lokaler Symbol-Satz in `index.html`; keine Bibliothek, Webfont oder CDN-Anfrage zur Laufzeit.
- MIT-Lizenz: `assets/vendor/PHOSPHOR-LICENSE.txt`

## Three.js

- Three.js 0.170.0, https://threejs.org/
- Lokal: `assets/vendor/three.module.js`
- MIT-Lizenz: `assets/vendor/THREE-LICENSE.txt`
- Unverändert von jsDelivr bezogen; zur Laufzeit keine CDN-Verbindung nötig.
