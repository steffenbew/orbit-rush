# Orbit Rush

[Play Orbit Rush](https://orbitrush.steffenbew.com/) — a browser-based Three.js arcade game. Fly through checkpoints, dodge asteroids and shoot enemy ships. All runtime assets are bundled; there is no account, backend, package install or build step.

## Run locally

From the project directory, run `./run start` (Python 3) and open the URL it prints. Use HTTP rather than opening `index.html` directly: the browser needs to fetch JavaScript modules and audio.

The server binds to loopback on port 8080, or picks a free port if 8080 is taken. To require a particular port, use `PORT=8082 ./run start`. Stop it with Ctrl+C or run `./run stop` in another terminal; this only stops the server for this checkout.

## Play

Complete the flight tutorial, then survive each 45-second level. Collisions drain your shield; passing checkpoints can restore it. A retry takes you back to the start of the level with its starting score and kills. After three lost lives, start a new run. The high score stays in your browser.

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Steer and aim | Move the mouse | Right joystick |
| Fire laser | Click or hold the primary button | Hold the orange button |
| Fire power laser | Space (recharges between shots) | Blue button |
| Change view | **V** or camera button | Camera button |
| Pause / resume | Esc or pause button | Pause button |

The camera cycles through **chase → cockpit → unobstructed first-person**. Chase is the default; subsequent visits use your saved choice. In chase view, put the green reticle on the small winged flight-direction marker to steer straight. In level flight the marker sits 55% down the play area. In cockpit view, the left instrument shows pitch and bank; the right shows laser energy and power-laser charge.

The game selects German for a German browser locale and English otherwise. Use the language selector before starting a flight to override it for that run. The toolbar also controls sound and fullscreen. If audio fails to load, retry or choose **Start without sound**.

## Develop and test

- [`index.html`](index.html) contains the HUD, scene, input handling and game loop. Physics uses a fixed 60 Hz step, independently of rendering.
- [`i18n.js`](i18n.js) holds the English and German UI strings. Keep both dictionaries in sync, including placeholders, tooltips and accessible names. Use English for the initial HTML.
- [`touch-controls.js`](touch-controls.js) handles joystick and weapon input; [`audio.js`](audio.js) handles playback. Bump the `audio.js` import's version parameter when changing audio assets: the audio fetches use it too.
- [`tests/`](tests/) contains regression tests. Flight suites exercise the actual game code with the bundled Three.js module and seeded randomness; see [the shared fixture](tests/helpers/flight-game.mjs).

Tests require **Python 3 and Node.js 20+**:

```sh
./run test                 # Fast regression suites, including the Python server tests
./run test:full            # Also run exhaustive field traversals and the five-minute starfield test
node tests/camera-view.mjs # Run a single suite while iterating
```

For a browser check, add `?test` to the URL to show rendered FPS and frame time. On loopback only, `?test&level=5` skips training and starts at the specified level (1–1000). Level 5 is useful for testing an asteroid field, shower and corridor; level 4 is the first Leviathan encounter. Check mouse and touch, portrait and landscape, and reduced motion when changing flight or HUD behavior.

If rendering stops with a diagnostics dialog, **copy the report before reloading**. It includes the first error, browser and viewport information, game state and render statistics. Nothing is uploaded automatically.

## Deploy

```sh
./run deploy
```

This publishes the **current working tree**, including uncommitted changes, without running tests. It requires Python 3, SSH key access to `steffenbew.com`, `rsync` and `curl`. [The deploy script](scripts/deploy.sh) uploads only the runtime files to `/www/htdocs/w00c06d8/subdomains/orbitrush/`, then checks the live HTTPS URL. It does not delete old files from the server.

## Install, play offline and update

On HTTPS, use the browser's install option (Safari on iOS: **Share → Add to Home Screen**). Once the first online visit has finished caching the game, it can launch offline.

Each production release is a complete snapshot. [`scripts/prepare-pwa.py`](scripts/prepare-pwa.py) generates a worker pinned to the SHA-256 hashes of the files listed in [`sw.js`](sw.js). Deploy uploads assets first, HTML next and the generated worker **last**, so a partial upload cannot replace a working offline release. When adding a runtime file, include it in the worker's file list and ensure the deploy script uploads it.

Updates take effect at the start or results screen, not mid-flight. If the server has new code but a browser still shows the old game, finish or exit active flights in all tabs. If an old or unresponsive window prevents the switch, close every Orbit Rush tab and installed app window, then reopen. The development worker deliberately passes requests through; to test a production snapshot locally, generate `sw.js` in a separate staging copy and serve that copy.

For asset sources, licenses and modifications, see [CREDITS.md](CREDITS.md).
