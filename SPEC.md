# SIM*BUCKS — Airport Coffee Kiosk Simulator (three.js)

A first-person barista simulator set in a coffee kiosk in a London airport
departures concourse. Reconstructed from two reference photographs. No external
assets: every texture is drawn procedurally to a canvas, every sound is
synthesised with WebAudio, every mesh is built from three.js primitives.

---------------------------------------------------------------------------
## 1. ART BIBLE (derived from the reference photos — agents cannot see them,
##    so this section is authoritative and must be followed literally)
---------------------------------------------------------------------------

### 1.1 The kiosk
An island unit standing free in the middle of a wide concourse. It is not a
room with walls; it is a peninsula of joinery you can walk around. Shape: a
long service line with a rounded "nose" at the west end where the counter
curves through 90 degrees and tapers down toward the floor.

**Signature elements, in order of visual importance:**

1. **The coral-orange tubular steel frame.** The single most recognisable
   feature. Powder-coated tube, ~55 mm diameter, colour #E2593C (a warm
   coral / burnt orange, NOT red, NOT safety orange). It does three jobs:
   - a waist-height railing (top rail at y=1.02 m) that fences the public side
     and channels the queue;
   - a tall arch that springs off the counter at the west nose and loops over
     the top of the kiosk (apex ~y=3.4 m) like a croquet hoop;
   - a low guard rail around the grab-and-go merchandise shelf.
   Welded, mitred corners with generous radii; no visible fixings.

2. **The botanical mural.** Painted on the outward-facing panels of the
   counter's west nose, the part the public sees from the seating side.
   Ground colour is a warm apricot/peach (#F2A65A → #E8814B gradient). Painted
   over it, in flat poster-style shapes with no shading:
   - long lanceolate coffee leaves in two greens (#3E7C4A deep, #7FB069 light),
     some leaves half-magenta (#8E2F5B) as if backlit;
   - clusters of round coffee cherries in magenta (#9B2C55), deep red
     (#C0392B) and mustard (#E0A526), each with a small darker crescent;
   - thin dark-green stems that swing in long arcs across the panel.
   Composition reads as a jungle of coffee branches growing up out of the
   floor. Motifs are large — a single leaf is ~40 cm long in world scale.

3. **Light oak joinery.** Everything not mural or steel is a pale, warm,
   straight-grained oak veneer (#C8A57B base, grain in #A8865C) in vertical
   slats about 90 mm wide with a 4 mm shadow gap between them. Counter tops
   and the bar-back worktop are a solid off-white composite (#EDE8E0) with a
   20 mm bullnose edge.

4. **The black soffit sign.** A deep matte-black fascia band hanging over the
   service line, its face toward the customer side, running most of the
   counter's length. On it, in white, the wordmark **SIM*BUCKS** in a heavy
   geometric sans, letter-spaced wide, the asterisk drawn as a small six-point
   star. To the left of the wordmark, a circular roundel: green disc
   (#00704A), a thin white ring inset, and inside it an ORIGINAL stylised
   crowned figure in white line art — a round crowned head, arms raised, twin
   wavy tails. It must read as a coffee-shop roundel at a glance but must NOT
   reproduce any real company's mark. The disc is ~0.62 m across and hangs
   slightly proud of the fascia. Both are internally lit and glow faintly.

5. **The menu wall.** Under the fascia, a run of landscape LCD panels in thin
   black bezels, all at the same height, canted very slightly down toward the
   customer. Left to right: two dense white menu boards (three columns of
   small drink names with prices in a serif-ish caps face, section headers
   like ESPRESSO, FRAPPUCCINO, TEAS, COLD DRINKS), then a photographic panel
   showing three iced Frappuccinos on a cream background with the word
   FRAPPUCCINO, then a smaller panel higher up showing a breakfast wrap on a
   plate with the caption BREAKFAST WRAPS. The screens are the brightest
   thing in the scene; they should visibly light the counter beneath them.

6. **The service line.** Left to right along the counter as the customer sees
   it: a till/POS station with a black terminal on a stalk and a card reader;
   a glass-domed cake stand; a lit pastry cabinet with three shelves of
   croissants, pain au chocolat, muffins and tray-baked slices on black wire
   racks; a condiment/napkin caddy; then the handoff plane at the far end
   where finished cups are placed for collection.

7. **The bar back.** Behind the barista, a parallel run of equipment on an
   off-white worktop: a squat chrome-and-black superautomatic espresso
   machine with a domed hopper; a Mastrena-style traditional machine with two
   group heads, a steam wand each side, and a row of portafilters; two conical
   burr grinders with clear hoppers of dark beans; a black iced-drink blender;
   a steel sink with a swan-neck tap; a stack of nested white cups; rows of
   pump syrup bottles in amber, hazel and green glass; a shelf of stainless
   milk pitchers; and — visible in the reference — two blue 19-litre water
   bottles stashed underneath.

8. **Grab-and-go merch shelf.** Freestanding at the east end past the handoff
   plane, ringed by the coral tube guard rail: three tiers of branded
   tumblers and reusable cups seen from above as a grid of white and green
   circular lids, plus a wire basket of bagged coffee.

9. **Bar seating.** Outside the kiosk on the mural side: two long communal
   tables of the same pale oak, ~4.5 m long and 0.75 m wide, running away
   from the kiosk, at bar height (1.05 m), with round-topped wooden stools
   (seat y=0.75) tucked under both sides. On the tabletops: abandoned cups,
   a paper bag, a phone. Black retractable belt stanchions stand near them.

### 1.2 The terminal around the kiosk
- **Floor**: large-format porcelain tiles, 1.2 m square, in a warm sand tone
  (#D8CFC0) with barely-visible 6 mm grout lines a shade darker, laid on a
  straight grid. Slightly polished — a soft blurred reflection of the coral
  steel and the menu screens is desirable but must stay cheap.
- **Ceiling**: 6 m up, flat, off-white, with a repeating grid of recessed
  linear slot lights and circular ceiling speakers/smoke heads. Structural
  ducting is not visible.
- **Overhead gantry sign**: a large dark-charcoal panel hanging on drop rods
  across the concourse behind the kiosk. Left half: a white left-pointing
  arrow, "1-28", a small walking-man icon and "15 mins". Right half: "30-43",
  a right-pointing arrow, walking man, "10 mins". Below, a thin green strip
  with a white "Toilets" and its icon, and a second green strip reading
  "Fire Exit" with the running-man icon. Aircraft-departure pictograms sit
  above the gate numbers.
- **Jet2.com billboard**: a very large red (#E4002B) illuminated panel high on
  the far wall. White script-ish wordmark "jet2.com", under it in white
  "Friendly low fares", and to the right, split by a thin white rule,
  "23 DESTINATIONS FROM LONDON" in condensed caps.
- **InMotion electronics store**: a black-fronted unit with a long yellow
  banner (#F5C518) above the entrance carrying "INM(O)TION" where the O is a
  teal-and-white disc, and repeated "JUST LANDED" green roundels advertising
  "Brand new from Bose — £299.99" with a headphone photo. Down one side, a
  vertical stack of small black brand plaques in white type: aelia, SAMSUNG,
  SONY, BOSE, JBL, BEATS, BANG & OLUFSEN, belkin. Inside, lit glass tables of
  phones and a big blue video wall reading "Explore a world of tech".
- **"discover LONDON" travel shop**: warm-lit, timber-shelved, with a green
  roundel sign, racks of red London souvenirs and a red telephone-box prop.
- **Aelia duty free**: far to the west, glossy black perimeter, red "SPECIAL
  OFFER" and "LOW £19.99" price cards, illuminated liquor and fragrance walls.
- **Seating pods**: banks of six black airport chairs on chrome beams, angled
  in rows, with power totems. Populate a few with idle passengers.
- **Props that sell the airport**: yellow "wet floor" cones, black belt
  stanchions, a cleaner's cart, a stack of grey stock crates behind the
  kiosk, wheeled cabin bags parked beside seats.

### 1.3 People
Stylised low-poly humans, ~12 primitives each, no faces beyond a simple
darker band for hair and a skin-tone head. Read at a glance by silhouette and
palette. Baristas wear black caps, black tees and a **green apron (#1E6B4F)**;
some wear a dark headscarf. Passengers wear muted travel clothing (grey,
navy, cream, olive, one high-vis yellow vest for a ramp worker) and carry a
backpack, a tote or a roller bag. Everyone walks with a simple two-bone leg
swing; nobody needs fingers.

### 1.4 Light and mood
Interior airport daylight-neutral: a hemisphere light (sky #FFF6E8, ground
#8C7F70) plus a soft key from above. Menu screens and the siren roundel are
emissive. Warm pools of light under the ceiling slots on the floor. No harsh
shadows — one shadow-casting directional light with a soft map is enough, and
only the kiosk and people receive it. The scene should feel bright, slightly
overlit, faintly plastic — like an airport at 7 a.m.

---------------------------------------------------------------------------
## 2. GAMEPLAY
---------------------------------------------------------------------------

You are the barista on the bar. A shift lasts 8 minutes of real time,
compressed as 05:00 → 13:00 on the terminal clock. Flights board on a
schedule; each boarding call sends a **rush** of passengers to the queue.

**Loop**: customer reaches the till → press E to take the order → a ticket
pins to the rail with the drink, size, name and any modifiers → build the
drink at the stations → place the finished cup on the handoff plane and call
the name → customer collects, pays, tips.

**Building a drink** (each step is an interaction on a station mesh):
- `CUP`     take a cup of the right size from the stack (short/tall/grande/venti)
- `GRIND`   hold at the grinder to dose the portafilter (a dose meter fills)
- `PULL`    lock the portafilter into the group head, hold to extract; the
            shot has a sweet spot — stop between 22 s and 30 s of the meter
- `STEAM`   hold the pitcher at the wand; a temperature gauge rises; release
            between 60 and 68 C or the milk scorches
- `POUR`    pour milk/espresso/water/cold brew into the cup
- `SYRUP`   click the pump N times; the ticket says how many
- `ICE`     scoop ice for cold drinks
- `BLEND`   run the blender for Frappuccinos, ~3 s
- `LID`     cap it and write the name

**Scoring**: correct drink = base price. Speed bonus if served before the
patience bar drops below half. Wrong size, wrong drink, missed syrup count,
scorched milk or a bitter over-extraction each cost a fraction. Patience
runs out → the customer leaves, no money, reputation hit. Three walk-outs
ends the shift early. Tips accumulate; the end-of-shift card shows drinks
served, accuracy, tips, and a rank (Green Apron → Coffee Master → Black Apron).

**Menu** (at least these, with prices in GBP):
Espresso 2.15, Americano 2.85, Latte 3.55, Flat White 3.65, Cappuccino 3.55,
Caramel Macchiato 4.15, Mocha 4.05, Cold Brew 3.75, Iced Latte 3.85,
Caramel Frappuccino 4.75, Matcha Latte 4.05, Chai Latte 3.85, English
Breakfast Tea 2.45. Food add-ons: Butter Croissant 2.75, Pain au Chocolat
2.95, Breakfast Wrap 4.95, Blueberry Muffin 2.85.

**Feel**: quick, forgiving, readable. Every station glows on hover with a
label; the held item is drawn in the bottom of the frame; a wrong action
gives an audible thunk rather than a modal. It should be funny — passengers
mutter about gate changes, someone orders a "venti quad shot half-caff
oat flat white, no foam", the PA chimes over everything.

---------------------------------------------------------------------------
## 3. TECH
---------------------------------------------------------------------------
- three.js r180, vendored at `vendor/three.module.js` (+ `three.core.js`,
  `vendor/addons/PointerLockControls.js`). Import map in `index.html` maps
  `three` and `three/addons/`.
- ES modules, no build step, no npm, no bundler. Served over a plain static
  server; must run from `python3 -m http.server`.
- No network requests at runtime. No external images, fonts or audio.
- Target 60 fps on an M-series laptop at 1600x900. Budget: < 120 k triangles,
  < 300 draw calls. Use InstancedMesh for repeated props (stools, chairs,
  tiles of merch, ceiling lights, crowd) and merge static geometry where it
  is free to do so.
- All code plain modern JS. No TypeScript, no frameworks, no React.
