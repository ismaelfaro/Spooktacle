# Spooktacle Video Mapping

**Procedural Halloween projection mapping for your house.**

Spooktacle is a web page you project onto the front of a house, or rooms. It plays an 8-scene looping show (about 3.5 minutes) with an on-demand jump scare. All sound is synthesized in the browser, with no audio files. A built-in editor lets you fit each zone (windows, door, walls, gable) to your real house.

It runs without installing anything and works offline. The only thing that uses the network is the "Creepster" font; without a connection it falls back to Impact.

Intended setup: a Window/Mac/Linux with Chrome (can work in other webbroser), a projector and speakers (any computer with a modern Chromium-based browser should work).

> **About the reference image.** `assets/home_picture.jpg` is a schematic placeholder, not a real photo. The default zones are laid out on it. Replace it with a photo of your own house (or load one from the editor panel) and adjust the zones.

## Quick start

Open `index.html` in Chrome. The first time it starts in edit mode; once a mapping is saved, it starts in show mode.

| URL | Effect |
|---|---|
| `index.html?show` | Start the show directly |
| `index.html?edit` | Start in mapping edit mode |
| `index.html?scene=4` | Start at scene 4 |
| `index.html?preview` | Simulate the night projection over the reference image (also key **V**) |
| `index.html?audio` | Try to start sound without waiting for a key press (kiosk mode) |

To serve it locally instead of opening the file:

```bash
python3 -m http.server 8777
# then open http://localhost:8777
```

## Setting it up

1. Place the projector where your reference photo was taken from (frontal, on the lawn), so that it covers the whole/part house.
2. Connect the projector to the computer as an **extended** display, not mirrored. In Chrome you can Cast de tab from the preferences.
3. Turn off the projector's keystone correction. The mapping already corrects perspective.
4. Open `index.html` in Chrome, drag the window to the projector display and press **F** for full screen.
5. Adjust the mapping with **E** (see below), then press **E** again to start the show.
6. Sound starts on the first key press or click. Change the volume with **+** and **−**.

Rmember keep the computer awake all night while the show runs

Kiosk mode (full screen, no bars, sound allowed from the start), run from the project folder on macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --kiosk --autoplay-policy=no-user-gesture-required "file://$PWD/index.html?show&audio"
```

### Tips

- **Glass:** windows let light through. Cover them from the inside with white paper or cloth, or lower the blinds. The preview simulates covered windows.
- **Colored doors:** a red door tints whatever is projected onto it, so the door zone uses light, intense colors.
- **Shadows:** bushes and lamp posts cast shadows. Raise the projector (tripod or tall table) if you can.
- **Darkness:** turn off the porch light. Black in the animation means "no light": only what is inside the zones is lit.

## Controls

| Key | Action |
|---|---|
| E | Edit the mapping / view the show |
| F | Full screen |
| M | Sound on/off (starts with the first key press) |
| + − | Volume |
| Space | Pause |
| ← → | Previous / next scene |
| 1 … 8 | Jump to a scene |
| J | Jump scare! (the whole house screams) |
| V | Preview over the reference image |
| H | Help |

## Adjusting the mapping (key E)

Zones come pre-placed over the reference image, which is shown in the background while you edit. With the projector on:

1. In the **Test pattern** view, each zone shows a grid, diagonals and a circle.
2. Drag each zone's **corners** to the real edge of the window, door or wall. Dragging from inside a zone moves the whole zone.
3. For fine adjustment, use the **arrow keys** (1 px, or 10 px with Shift). **Tab** switches the active corner.
4. A zone is right when the circle looks round on the house.
5. Press **G** to switch between the test pattern and the animation.

Other editor actions:

- Double-click an empty spot: add a zone.
- **⌘Z**: undo.
- **Delete**: remove the selected zone.

The panel also lets you:

- Change each zone's **type** and **shape**.
- Try any **sound effect**.
- Adjust the **volume**.
- Load a different **reference photo**.
- **Export** and **import** the mapping as a `.json` file.

The mapping is saved in the browser only.

| Zone type | Use in the show |
|---|---|
| Facade / Column / Free | Walls: backgrounds, bricks, final text |
| Roof / gable | Moon, witch, lightning |
| Window | Ghosts, eyes, pumpkins |
| Door / Garage | Monster mouth, skeleton, spider web |

Available shapes: rectangle, arch, triangle and ellipse. Windows and the door are drawn on top of the walls. Besides the zones, there is a global layer that spans the whole house, for things that travel from one zone to another (bats, ghosts, lightning).

## Scenes (looping)

1. **Awakening** (~24 s): a spark becomes a beam that sweeps the house and draws its architecture in neon. The moon rises, candles light up in every window and heartbeats grow until the house "turns on". Then come bats, fireflies and a gust that blows the candles out.
2. **Ghosts** (~34 s): ghosts peek out of windows, fly from one to another leaving trails, and one lunges at the audience ("BOO!").
3. **Storm** (~29 s): rain with depth, flickering lightning and a bolt that strikes the gable. Silhouettes appear in the windows with each flash, and each thunderclap is synced with its lightning.
4. **Eyes** (~30 s): the house is alive. The eyes follow a moth, the door's mouth breathes, eats it and roars. Then everyone looks at the audience and falls asleep.
5. **Spiders** (~26 s): webs grow with dew and spiders descend on their threads. A giant spider crosses the whole house.
6. **Collapse** (~29 s): a 3D brick wall breathes, cracks with lava and collapses into a pit of fire. Glass shatters and the wall rebuilds itself.
7. **Pumpkin party** (~34 s): a full song at 112 BPM. Pumpkins sing call-and-response, the skeleton dances, the witch crosses the moon and concert spotlights sweep the house.
8. **Happy Halloween** (~24 s): the title drops letter by letter with bell chimes, followed by fireworks, ghosts saying goodbye and a fade to night that links back to scene 1.

The jump scare (**J**) can be triggered at any time.

## Sound

Everything is synthesized with WebAudio, with no audio files.

**Score per scene** (`js/audio/0N-*.js`): music, ambience and effects synced with the visuals. Each effect plays at the moment something happens and at the position on the house where it happens (window, door, gable).

- Instruments: organ, music box, theremin, choir, strings, pizzicato, bells, bass and drums.
- Ambience: wind, rain, crickets, fire, drone and night.

**Effects** (`js/audio/sfx-*.js`): they play on the left or right depending on where they happen on the house, and can move from side to side.

| Family | Effects |
|---|---|
| Storm and impacts | thunder, earthquake, impact, riser, gust, collapse, fire, wind, crackle |
| Creatures | wolf, owl, raven, bats, spiders, roar, heartbeat, cat, rat, zombie, monster breathing, flies, bones |
| Voices | evil laugh, witch laugh, ghost, moan, "BOO!", scream, whispers, giggle, choir |
| The house | creak, door knocks, chains, broken glass, slam, footsteps, clock, chimes, window, plank, cauldron |
| Magic | sparkles, pop, slime, church bell, spell, witch's broom, music box, ghostly shimmer, bubbles |

Effects can be tried from the edit panel.

## Development tools

They require Google Chrome (the scripts use the macOS path; edit `CHROME` in the scripts for other systems). Everything runs headless, without opening windows.

| Command | What it does |
|---|---|
| `scripts/shot.sh <scene> <seconds> <out.png> [preview\|raw]` | Capture a frame (`preview` = over the night photo) |
| `scripts/shot.sh bench` | Measure milliseconds per frame for each scene |
| `scripts/shot.sh errors <scene>` | Show console errors while drawing that scene |
| `scripts/audio.sh <scene> <out.png>` | Render the scene's audio without speakers: levels + spectrogram |
| `scripts/audio.sh sfx <name> <out.png>` | Same, for a single effect |

To create a new scene, add a file `js/scenes/NN-name.js` that calls `registerScene({...})` (the API is documented in `js/scenes.js`). If it needs music, add its score `js/audio/NN-name.js` with `registerScore('Name', {...})`. In both cases, add the matching `<script>` tag to `index.html`.

> Note: the editor UI is in English; most source-code comments are still in Spanish. Translations are welcome.

## Project structure

```
index.html              page and edit panel
css/style.css           styles
js/art.js               procedural drawings (ghosts, pumpkins, eyes, skeleton…)
js/homography.js        per-zone warping (matrix3d)
js/zones.js             zones, saving, default zones (measured on the reference image)
js/scenes.js            scene registry and its API
js/scenes/*.js          one scene per file + the jump scare
js/audio.js             sound engine: buses, reverb, instruments, ambience, scores
js/audio/sfx-*.js       sound effects by family
js/audio/0N-*.js        score for each scene
js/editor.js            mapping editor
js/main.js              loop, global layer, fades, keyboard
assets/fachada.jpg      reference image (placeholder: replace with your own house)
tools/audio-lab.html    offline audio lab
scripts/                screenshots, benchmark and audio analysis
```

## Credits and license

- Font: [Creepster](https://fonts.google.com/specimen/Creepster) (SIL Open Font License), loaded from Google Fonts.
- Licensed under the [Apache License 2.0](LICENSE).
