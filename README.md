# SIM&#10033;BUCKS

A first-person barista simulator that runs in your browser. You work the bar at a
coffee kiosk in a London airport departures concourse: flights board, the queue
builds, and you grind, pull, steam and pour your way through the morning rush.

Built with [three.js](https://threejs.org) r180. No build step, no bundler, no
package manager, no external assets — every texture is drawn to a canvas at
runtime and every sound is synthesised with WebAudio.

**▶ Play it: https://nikolays.github.io/simbucks/**

---

## Controls

| | |
|---|---|
| Mouse | Look |
| `W` `A` `S` `D` | Move behind the bar |
| `E` | Interact — tap for a single action, **hold** for the meters |
| `Q` | Dump what you are holding |
| `L` | Lid the cup |
| `Esc` | Release the mouse |

Take the order at the till, build the drink at the stations along the back bar,
then put it down on the handoff plane. Watch the meters: the shot has a sweet
spot, and milk scorches above 75 °C.

## Running it locally

Any static file server will do — there is nothing to build.

```bash
git clone https://github.com/NikolayS/simbucks.git
cd simbucks
python3 -m http.server 8123
# open http://localhost:8123
```

Add `?debug` to the URL to surface module errors on screen.

## How it is put together

```
index.html            import map + boot
src/core/             layout constants, event bus, seeded RNG
src/gfx/              procedural canvas textures, shared materials, WebAudio
src/world/            terminal shell and props, the kiosk and its equipment
src/entities/         low-poly people, animation, crowd
src/game/             menu, orders, customers, shift state, station minigames
src/player/           first-person controls, first-person hands
src/ui/               HUD and end-of-shift card
vendor/               three.js r180 (MIT), vendored
```

Every module is loaded independently and failures are isolated, so a broken
file degrades the scene instead of blanking it. `src/core/layout.js` holds
every hard coordinate in the world; nothing else invents its own numbers.
`CONTRACT.md` documents the interface each module implements, and `SPEC.md` is
the art bible the geometry was built from.

## About the setting

The kiosk is modelled from two photographs of a real airport coffee bar — the
coral tube frame, the painted coffee-branch mural, the pale oak joinery, the
menu wall and the black soffit sign. **SIM&#10033;BUCKS is an original parody and
is not affiliated with, endorsed by, or connected to Starbucks Corporation or
any other company.** All marks, signage and artwork in the game are drawn from
scratch; no third-party logo or asset is reproduced.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE).
three.js is bundled under the MIT licence.
