# Asset credits

All assets are served locally. Audio source and license links are also available in the game's **Audio credits** dialog.

## Sound effects

### Kenney — Sci-Fi Sounds (1.0)

[Source](https://opengameart.org/content/sci-fi-sounds) · [Original archive](https://opengameart.org/sites/default/files/sci-fi_sounds.zip) · [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) · [Bundled notice](licenses/KENNEY-LICENSE.txt)

| File in `assets/audio/` | Source in the pack's `Audio/` directory | Changes |
| --- | --- | --- |
| `checkpoint-pass.wav` | `forceField_001.ogg` | Converted to 44.1 kHz WAV. |
| `shield-hard.wav` | `forceField_000.ogg` | Converted to 44.1 kHz WAV for shield-wall contact. |
| `laser-soft.mp3` | `laserRetro_000.ogg` | Low-pass filtered at 1.5 kHz and converted to MP3. |
| `empty-click.wav` | `impactMetal_000.ogg` | First 120 ms, filtered, faded, compressed and level-adjusted; mono WAV. |
| `impact-1.mp3`, `impact-2.mp3`, `impact-3.mp3` | `impactMetal_000.ogg`, `impactMetal_001.ogg`, `impactMetal_003.ogg`, respectively | Loudness-normalized and converted to MP3. |
| `blast-1.mp3`, `blast-2.mp3`, `blast-3.mp3` | `explosionCrunch_000.ogg`, `explosionCrunch_002.ogg`, `explosionCrunch_004.ogg`, respectively | Loudness-normalized and converted to MP3. |

### dravenx — Space shooter sound effects

[Source](https://opengameart.org/content/space-shooter-sound-effects) · [Original archive](https://opengameart.org/sites/default/files/sounds_1.zip) · [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)

| File in `assets/audio/` | Source in the pack | Changes |
| --- | --- | --- |
| `go-bing.wav` | `sounds/buttonselect/6.wav` | Unmodified; played after training. |
| `reward.wav` | `sounds/powerups/1.wav` | Unmodified. |
| `checkpoint-miss.wav` | `sounds/misc/error.wav` | Loudness-normalized and converted to 44.1 kHz mono WAV. |
| `warning-low.wav` | `sounds/misc/alarm.wav` | Trimmed to the first 0.65 s, slowed to 85%, resampled to 44.1 kHz, low-pass filtered at 800 Hz, attenuated and faded at the edges. |

`lock-on.wav` is an original two-tone confirmation synthesized for Orbit Rush; it uses no external samples.

## Music

**Juhani Junkala (SubspaceAudio)** — *Retro Game Music Pack · Level 1*, from [5 Action Chiptunes by Juhani Junkala](https://opengameart.org/content/5-chiptunes-action). [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) · [Bundled notice](licenses/MUSIC-LICENSE.txt).

`assets/audio/orbit-arcade.mp3` was made from `Juhani Junkala [Retro Game Music Pack] Level 1.wav`: low-pass filtered at 11 kHz, loudness-normalized and converted to MP3.

## Cockpit and asteroid fields

The canopy, instruments and switches were drawn for Orbit Rush. The [cockpit from *Star Wars: Squadrons* (EA / Motive)](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1222730/ss_3518ecebb8d16d25b675d139b3d0817db5248a33.jpg) was a visual reference for the segmented windshield and separate instrument pods. No images from that game are used.

NASA's observations of [DART's ejecta cone and filaments](https://science.nasa.gov/missions/hubble/hubble-captures-movie-of-dart-asteroid-impact-debris/) and [Scheila's asymmetric debris plumes](https://science.nasa.gov/missions/hubble/nasas-swift-and-hubble-probe-asteroid-collision-debris/) informed the asteroid-field layouts. The game is not a scale simulation.

## Icons and rendering

- [Phosphor Icons](https://phosphoricons.com/), [`@phosphor-icons/core` 2.1.1](https://registry.npmjs.org/@phosphor-icons/core/-/core-2.1.1.tgz), Regular. The HUD uses locally embedded SVG paths; the rocket also appears in the favicon and [app icons](app-icons/icon-512.png). [MIT license](licenses/PHOSPHOR-LICENSE.txt).
- [Three.js](https://threejs.org/) 0.170.0, vendored from [jsDelivr](https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js) and bundled for production. [MIT license](licenses/THREE-LICENSE.txt).
