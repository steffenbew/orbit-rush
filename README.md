# Orbit Rush

[Play Orbit Rush](https://orbitrush.steffenbew.com/) — a browser-based Three.js arcade game. Fly through checkpoints, dodge asteroids and shoot enemy ships. The site runs entirely in the browser. Development uses Node.js 22.12+ and Vite. Production only needs static file hosting.

## Run locally

```sh
./run setup     # Install the locked development dependencies
./run start     # Open the printed URL
```

Vite applies CSS edits without interrupting a flight. Changes to game modules or HTML reload the page.

The server binds to loopback on port 8080, or picks a free port if 8080 is taken. To require a particular port, use `PORT=8082 ./run start`. Stop it with Ctrl+C or run `./run stop` in another terminal; this only stops the Node server for this checkout.

## Play

Complete the flight tutorial, then survive each 45-second level. Collisions drain your shield; passing checkpoints can restore it. A retry takes you back to the start of the level with its starting score and kills. After three lost lives, start a new run. The high score stays in your browser.

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Steer and aim | Move the mouse | Right joystick |
| Fire laser | Click or hold the primary button | Hold the orange button |
| Fire power laser | Space (recharges between shots) | Blue button |
| Change view | **V** or camera button | Camera button |
| Pause / resume | Esc or pause button | Pause button |

The camera cycles through **unobstructed first-person → chase → cockpit**. Unobstructed first-person is the default; subsequent visits use your saved choice. In chase view, put the green reticle on the small winged flight-direction marker to steer straight. In level flight the marker sits 55% down the play area. In cockpit view, the left instrument shows pitch and bank; the right shows laser energy and power-laser charge.

The game selects German for a German browser locale and English otherwise. Use the language selector before starting a flight to override it for that run. The toolbar also controls sound and fullscreen. If audio fails to load, retry or choose **Start without sound**.

## Develop and test

Start in the feature folder for **what changes**. For **when it runs**, read [`updateSimulation(dt)` in main.js](src/main.js): timers → player and camera → arrivals → fleet → hazards → firing → projectiles → effects. The [clock](src/flight/simulation-clock.js) runs those phases at 60 Hz. `renderFrame()` runs once per displayed frame, independently of how many steps elapsed.

| Change | Owner | Focused tests (`node --test tests/<name>.mjs`) |
| --- | --- | --- |
| Advance, retry, lives, score checkpoints, result dialog | [run/](src/run): `progression.js` decides what survives; `result.js` displays it. Restoring a result in `main.js` does not spend another life. | `run-progression`, `crash-flight`, `pwa-updates` |
| Flight tutorial | [run/tutorial.js](src/run/tutorial.js) owns lesson order, required actions, retries and hint timing. `updateFlightTutorial` in `main.js` places practice targets, then starts the timed course without resetting the flight. | `tutorial`, `control-hints`, `flight-traffic` |
| Kill rewards and combo windows | [run/scoring.js](src/run/scoring.js) computes points on each kill. `award` in `main.js` applies them, displays feedback and saves the high score. | `scoring` |
| Steering, speed, camera selection and chase framing, player hull, shield readout | [flight/](src/flight): [physics.js](src/flight/physics.js) owns the live aircraft’s steering, drift and bank. Asteroid forecasts reuse the same acceleration and heading step without changing the pilot’s attitude. [view.js](src/flight/view.js) handles chase framing, mouse steering relative to the nose, and joystick reticle placement; collision and firing use the pilot camera. See also `player-collision.js` and `shield-hud.js`. | `flight-physics`, `camera-view`, `steering`, `touch-controls`, `player-collision`, `shield-hud` |
| Crash coast and tumble | [flight/crash-motion.js](src/flight/crash-motion.js) slows the ship and rotates it away from the hit. `startCrash` in `main.js` spends a life and stops weapons; the round timer opens the result two seconds later. | `crash-flight`, `explosion-shockwave` |
| Player shield damage | [flight/shield-damage.js](src/flight/shield-damage.js) sets collider damage and hit-flash strength. In `main.js`, `damageShield` applies the loss; each caller decides crash, recoil and sound. | `damage-feedback`, `flight-rings`, `flight-boundary`, `crash-flight` |
| Route and checkpoint crossings | [course/checkpoints.js](src/course/checkpoints.js) plans and moves gates, draws guidance and reports a crossing. `resolveFlightRing` in `main.js` applies tutorial, reward or damage. | `course-layout`, `flight-rings` |
| Flight boundary and rebounds | [course/boundary.js](src/course/boundary.js) reflects the proposed flight motion **before** scenery moves. [flight/physics.js](src/flight/physics.js) aligns the rebound with the steering limits; `constrainFlightToBoundary` in `main.js` applies damage. | `flight-boundary`, `flight-physics` |
| Individual asteroids that cross the flight path | [course/crossing-asteroids.js](src/course/crossing-asteroids.js) schedules fly-bys, chooses their lead time, and reuses up to two rocks. `updateShipArrivals` in `main.js` pauses new arrivals during training and course breaks; `updateFleet` moves rocks already in flight. | `crossing-asteroids`, `flight-dynamics`, `flight-environments` |
| Asteroid encounters and field collisions | [course/](src/course): [encounter-plan.js](src/course/encounter-plan.js) schedules events and plans their position, drift, spacing and corridor shape. [asteroid-encounter.js](src/course/asteroid-encounter.js) activates them, pools rocks and waits for the previous field to clear. `asteroid-field.js` places rocks; `debris-field.js` indexes the visible pieces. [asteroid-impacts.js](src/course/asteroid-impacts.js) detects rock–ship hull contacts and resolves rock rebounds, fractures and detached field pieces. `collideShipsWithAsteroids` in `main.js` applies destruction and boss immunity. | `shower-streams`, `encounter-phases`, `field-passages`, `corridor-collision`, `asteroid-impacts` |
| Fleet composition, spawn placement and reuse, steering, boss attacks | [fleet/](src/fleet): `roster.js` picks models; [spawn.js](src/fleet/spawn.js) resets them and sets their starting courses. [arrivals.js](src/fleet/arrivals.js) schedules waves and checkpoint companions; `traffic.js` steers; `capital-ship.js` runs the boss. `updateFleet` in `main.js` keeps course decisions ahead of movement. | `fleet-roster`, `fleet-spawn`, `fleet-arrivals`, `ring-ship-arrivals`, `flight-traffic` |
| Player lasers and targeting | [weapons/](src/weapons): `rules.js` for heat, charge and speed; `targeting.js` for lock and aim; `projectiles.js` for travel and contacts; `hud.js` for readouts. | `node --test tests/weapons*.mjs` |
| Destruction, debris and solid fragments | [explosions.js](src/presentation/explosions.js) draws and disposes visual effects. [flight/physics.js](src/flight/physics.js) applies blast push; `applyExplosionShockwave` in `main.js` handles camera feedback. [fragments.js](src/course/fragments.js) moves solid pieces and reports contacts. Only rendered fragments can hit the player. | `explosion-shockwave`, `asteroid-visibility`, `asteroid-impacts`, `crash-flight` |
| Menu fleet and orbiting asteroid belt | [presentation/intro.js](src/presentation/intro.js) frames the preview ships and animates the belt; `startGame` in `main.js` switches into play. | `intro-fleet`, `intro-orbit` |
| Repair pickups | [course/repair-pickup.js](src/course/repair-pickup.js) places, moves and detects collection. `updateRepairPickup` in `main.js` applies the capped shield reward. | `repair-pickup`, `flight-environments` |
| Round timer, progress bar and final countdown | [presentation/round-clock.js](src/presentation/round-clock.js) displays course time and plays countdown ticks. `advanceRoundTimers` in `main.js` advances the clock and ends the round. | `hud-layout`, `simulation-timing` |
| `?test` FPS and frame time | [presentation/frame-stats.js](src/presentation/frame-stats.js) samples rendered frames, not simulation ticks. `main.js` resets the readout with the simulation clock. | `frame-stats`, `simulation-timing` |
| Layout, translations, sound, sky | [index.html](index.html) and [presentation/](src/presentation): `game.css`, `i18n.js`, `audio.js`, `space-background.js`, `planet.js` | `hud-layout`, `i18n`, `audio`, `space-background` |
| Mouse, keyboard and touch input | [platform/player-controls.js](src/platform/player-controls.js) remembers pointer position, captures active pointers and clears held fire. [platform/touch-ui.js](src/platform/touch-ui.js) handles menu buttons and mobile viewport anchoring. [flight/view.js](src/flight/view.js) supplies camera-relative aim math; `updateFiringInput` in `main.js` applies held fire on simulation ticks. | `steering`, `touch-controls`, `pause-menu`, `camera-view` |
| Renderer failures and offline updates | [platform/](src/platform): `render-diagnostics.js`, `pwa.js` | `render-diagnostics`, `pwa-updates` |

[main.js](src/main.js) still coordinates arrivals, tutorial transitions, score feedback, crash effects and round lifecycle. Import feature modules directly for rule tests; use the [seeded flight fixture](tests/helpers/flight-game.mjs) for interactions that need a world.

**Which asteroid hit the player?** All three paths use the [player hull](src/flight/player-collision.js) and report hits to `collideWith()` in `main.js`. Start with the representation you saw:

- **Individual fleet rock:** `recordVisibleFleet()` in [fleet/visuals.js](src/fleet/visuals.js) records a sighting only on a rendered frame. Once seen, the rock can hit a wing off-screen. `updateFleet()` in [main.js](src/main.js) checks that swept contact. Test: `asteroid-visibility`. For a rock bouncing off another rock instead, see [asteroid-impacts.js](src/course/asteroid-impacts.js).
- **Piece of an instanced field or corridor wall:** `updateContacts()` in [debris-field.js](src/course/debris-field.js) checks the rendered instance. If a rock knocks that piece loose, `asteroid-impacts.js` removes the instance and hands it to the fragment system.
- **Loose solid fragment:** [fragments.js](src/course/fragments.js) moves the piece and checks for player contact after it has been seen. Dust and wreckage drawn by [explosions.js](src/presentation/explosions.js) are not collision objects.

`src/` holds authored browser code and styles. `assets/` holds imported audio and vendored libraries. `public/` holds install icons, notices and the manifest, copied as-is. Keep [sw.js](sw.js) at the root for its scope; [pwa.js](src/platform/pwa.js) coordinates safe updates in the browser.

Use the default suite while iterating. It runs every test file, including real static builds and offline update checks, with representative seeded flights. Use the full suite before releasing or changing flight physics, encounter timing, or collision geometry.

```sh
./run test                 # Fast regression suites, including the server and build tests
./run test:full            # Wider level, seed and FPS sweeps plus the five-minute simulated starfield soak
node tests/camera-view.mjs # Focused suite
ORBIT_TEST_FULL=1 node --test tests/asteroid-fields.mjs # Full sweep for just one feature
```

For a browser check, add `?test` to the URL to show rendered FPS and frame time. On loopback only, `?test&level=5` skips training and starts at the specified level (1–1000). Level 5 is useful for testing an asteroid field, shower and corridor; level 4 is the first Leviathan encounter. Check mouse and touch, portrait and landscape, and reduced motion when changing flight or HUD behavior.

If rendering stops with a diagnostics dialog, **copy the report before reloading**. It includes the first error, browser and viewport information, game state and render statistics. Nothing is uploaded automatically.

## Build, preview and deploy

```sh
./run build     # Clean and regenerate dist/ from the working tree
./run preview   # Serve dist/ with production cache behavior (default port 8081)
./run deploy    # Rebuild, then upload to the live site; does not run tests
```

Use `./run start` for everyday work: it serves source modules with live refresh. Preview serves only the static build, without Vite. Stop it before switching to preview. To check offline play, open the preview online, wait for its worker to install, reload, then switch the browser offline and reload again.

[`scripts/build.mjs`](scripts/build.mjs) runs Vite with a relative base for subdirectory hosting. JS, CSS and audio have per-file hashes under `dist/assets/`. The build hashes the emitted files (including `public/`) to generate the offline worker. When installing an update, the browser can reuse unchanged immutable files from its HTTP cache; their integrity is still checked.

A CSS-only update in a local Chrome comparison transferred 125 kB instead of 2.73 MB with the old per-release directory (warm HTTP cache, gzip for text, response bodies only). The first install or a cleared cache still downloads the full snapshot.

Publish **the contents of `dist/`**, including `.htaccess`. On non-Apache hosts, set `Cache-Control: public, max-age=31536000, immutable` for Vite’s hashed files under `assets/` and `no-cache` for the root HTML, manifest and worker. No Node process, Python, or application backend runs in production.

[`scripts/deploy.sh`](scripts/deploy.sh) requires SSH access to `steffenbew.com`, `rsync` and `curl`. It publishes immutable files first, then root metadata, HTML and finally `sw.js`. It does not delete previous bundles: already-open tabs may still need them.

## Install, play offline and update

On HTTPS, use the browser's install option (Safari on iOS: **Share → Add to Home Screen**). Once the first online visit has finished caching the game, it can launch offline.

Each production worker verifies every cached file against its SHA-256 digest. Missing or mixed files reject the new snapshot instead of replacing a working offline release.

Updates take effect at the start or results screen, not mid-flight. If the server has new code but a browser still shows the old game, finish or exit active flights in all tabs. If an old or unresponsive window prevents the switch, close every Orbit Rush tab and installed app window, then reopen. The development worker deliberately passes requests through; use `./run preview` to test a production snapshot.

For asset sources, licenses and modifications, see [CREDITS.md](public/CREDITS.md).
