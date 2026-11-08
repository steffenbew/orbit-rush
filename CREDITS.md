# Audio-Quellen

Die Audiodateien werden lokal aus `assets/audio/` abgespielt; es gibt keine Audio-Tracking- oder Streaming-Dienste.

## Zielerfassungs-Bestätigung

- `lock-on.wav`: eigens für Orbit Rush synthetisierter Zweiklang, keine externen Samples.
- Zwei kurze Sinustöne mit 540 und 720 Hz, weicher Ein-/Ausblendung und exponentiellem Ausklang; 160 ms, mono PCM-WAV, 16 Bit/44,1 kHz.
- Feste Tonhöhe, Gain 0,12; einmalige, leise Bestätigung beim Einrasten eines Ziels.

## Aktuelle Laser-, Leermagazin-, Treffer- und Explosionssounds

**Sci-Fi Sounds (1.0)** von **Kenney**

- Quelle: https://opengameart.org/content/sci-fi-sounds
- Originalpaket: https://opengameart.org/sites/default/files/sci-fi_sounds.zip
- Lizenz: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Original-Lizenzdatei: `assets/audio/KENNEY-LICENSE.txt`
- Aktiver Lasersound: `laser-soft.mp3`, abgeleitet von `laser-1.mp3`, zusätzlich mit 1,5-kHz-Tiefpass bearbeitet. Leiser Mix und feste Abspielgeschwindigkeit 0,9; kein Variantenwechsel.
- Leermagazin-Klick: `empty-click.wav`, erste 120 ms von `Audio/impactMetal_000.ogg`, 400-Hz-Hochpass, 2,4-kHz-Tiefpass, Ausklang von 40–120 ms, Lautstärke zunächst auf 70 %, anschließend Dynamikkompression (Schwelle 0,045, Verhältnis 4:1, Attack 0,1 ms, Release 20 ms, Makeup ×5) und +2 dB für einen besser hörbaren Klangkörper; mono PCM-WAV mit 44,1 kHz. Im Spiel mit fester Tonhöhe und Gain 0,28 abgespielt.
- Aufbewahrte ursprüngliche Laservarianten: `laser-1.mp3`, `laser-2.mp3`, `laser-3.mp3`: `Audio/laserRetro_000.ogg`, `Audio/laserRetro_002.ogg`, `Audio/laserRetro_004.ogg`
- `impact-1.mp3`, `impact-2.mp3`, `impact-3.mp3`: `Audio/impactMetal_000.ogg`, `Audio/impactMetal_001.ogg`, `Audio/impactMetal_003.ogg`
- `blast-1.mp3`, `blast-2.mp3`, `blast-3.mp3`: `Audio/explosionCrunch_000.ogg`, `Audio/explosionCrunch_002.ogg`, `Audio/explosionCrunch_004.ogg`
- Änderungen: MP3-Konvertierung (44,1 kHz), Lautstärkeangleichung mit FFmpeg loudnorm (-18 LUFS Zielwert). Variable Abspielgeschwindigkeit/Tonhöhe im Spiel.
- Treffer und Explosionen: je drei Varianten, keine unmittelbar wiederholte Variante. Größere Schiffe explodieren mit tieferer Tonhöhe. Der Laser verwendet nur einen gleichbleibenden Sound.

## Combo-Sound, Kollisionsalarm und aufbewahrte bisherige Soundeffekte

`reward.wav` und `warning-low.wav` sind aktiv. `shot.wav`, `hit.wav` und `explosion.wav` werden nicht mehr abgespielt.

**Space shooter sound effects** von **dravenx (Dravenx)**

- Quelle: https://opengameart.org/content/space-shooter-sound-effects
- Originalpaket: https://opengameart.org/sites/default/files/sounds_1.zip
- Lizenz: **Creative Commons Attribution 3.0 Unported (CC BY 3.0)**
- Lizenztext: https://creativecommons.org/licenses/by/3.0/
- `shot.wav`: `sounds/lasers/5.wav`
- `hit.wav`: `sounds/explosions/2.wav`
- `explosion.wav`: `sounds/explosions/5.wav`
- `reward.wav`: `sounds/powerups/1.wav`
- `warning-low.wav`: aus `sounds/misc/alarm.wav`. Erste 0,65 Sekunden verwendet, auf 85 % der ursprünglichen Tonhöhe/Abspielgeschwindigkeit abgesenkt, auf 44,1 kHz resampelt, 800-Hz-Tiefpass, Lautstärke auf 65 %, Schnittkanten mit 3/5 ms geglättet. Dauer ca. 0,765 Sekunden; im Spiel mit Ruhepause alle 0,95 Sekunden wiederholt.
- Die übrigen WAV-Dateien wurden unverändert übernommen; Lautstärke und Abspielgeschwindigkeit werden im Spiel angepasst.

## Aktuelle Hintergrundmusik

**Retro Game Music Pack · Level 1** von **Juhani Junkala (SubspaceAudio)**

- Quelle: https://opengameart.org/content/5-chiptunes-action
- Sammlung: „5 Action Chiptunes By Juhani Junkala“
- Original: `Juhani Junkala [Retro Game Music Pack] Level 1.wav`
- Lokal: `assets/audio/orbit-arcade.mp3`
- Lizenz: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Original-Lizenzhinweis: `assets/audio/MUSIC-LICENSE.txt`
- Änderungen: Tiefpass bei 11 kHz, Lautstärkeangleichung (-18 LUFS Zielwert), MP3-Konvertierung. Im Spiel leise als Loop unter den Effekten abgespielt.

## Aufbewahrte bisherige Hintergrundmusik (nicht mehr aktiv)

**Space Battle (BPM 130)** von **MintoDog**

- Quelle: https://opengameart.org/content/space-battle
- Originaldatei: https://opengameart.org/sites/default/files/space_battle_bpm130.mp3
- Lokal: `assets/audio/space-battle.mp3` (unverändert)
- Lizenz: **CC0 1.0 Universal**
- Lizenztext: https://creativecommons.org/publicdomain/zero/1.0/

Die Quellen und Lizenzlinks der aktiven Sounds sind zusätzlich im Spiel über „Audio-Credits“ zugänglich.

## Three.js

- Three.js 0.170.0, https://threejs.org/
- Lokal: `assets/vendor/three.module.js`
- MIT-Lizenz: `assets/vendor/THREE-LICENSE.txt`
- Unverändert von jsDelivr bezogen; zur Laufzeit keine CDN-Verbindung nötig.
