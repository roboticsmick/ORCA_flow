# Changelog

## 2026-11-01

### Added

- Trace colours, off by default. `line-theme: kelly`, `okabe-ito`, any `theme` name, or `custom` with `line-palette` gives every trace its own colour. A trace is one wire across every box level plus any wires sharing its bus. With `line-theme` left at `true` or `box`, every fixture's SVG is byte-identical to before.
- Per-wire colour override, `{#hex}` after a target. Non-hex values and colours after a source are reported in the popup and never reach the SVG.
- `js/traces.js`, a pure module for trace grouping and colour assignment, with `test/traces.test.js`.
- `test/fixtures/colours.flow`, and a harness check that every drawn part of one trace has one colour.

### Fixed

- A wire whose two ends sit a few pixels apart, including where it crosses a box edge, now drops straight instead of jogging sideways. A straightening pass in `js/router.js` moves one end onto the other's column when it is in reach and clear of other wires. Xbee <> Ground Station and `ROV <> ground` on `cross.flow` are now straight.

## 2026-10-31

### Fixed

- A wire between two vertically aligned nodes now runs straight down. The gap separation pass treated a net's own source stub and target drop as two wires sharing a column and pushed them apart, which drew a sideways jog. Test "a wire between two aligned nodes keeps its ends in one column".

## 2026-10-30

### Added

- Cross-section endpoint resolution. A bidirectional line (`<>`, `<->`) now states a link between nodes that already exist and may reach into another section, and any endpoint may be written `section:Name`. A bare name resolves to its own block first, then to the one placed section that declares it. Directional lines (`>`, `<`, `->`, `<-`) still declare and connect inside one block, so existing diagrams resolve exactly as before.
- Unresolved endpoints are reported. An ambiguous name lists its candidates and the qualified form to use, an unknown name names the block it was written in. Both reach the status bar and a modal instead of vanishing.
- `js/levels.js`, a pure module that turns the layout tree into one routing level per container and splits each connection into the pieces those levels must draw. A wire from a node in `sensors` to a node in `ground` becomes five pieces, because it crosses three container boundaries.
- `planLevels()` in `js/flowschem.js`, which runs that decomposition over the parsed connections. It needs no geometry, so it is the plan phase's first step.
- `test/levels.test.js`, 11 tests over the level tree and net decomposition, including the anonymous container a `/` row split produces.
- `test/fixtures/interstack.flow`, the minimal reproduction. Two stacks, one `USV <> ROV` section-level wire and two node-to-node wires crossing stacks.
- `test/fixtures/ambiguous.flow`, the negative case. A name declared in two sections, an endpoint that exists nowhere, and a qualified wire that must still draw.
- `test/screenshot.js` dumps `window.OrcaDebug` when the page sets it, so endpoint resolution and net decomposition can be inspected on the real render rather than inferred from the SVG.
- `planDiagram()` in `js/flowschem.js`, a plan phase that runs before anything is drawn. It decomposes the nets, plans every leaf section, sizes the page from those plans and places every box, so emission reads positions rather than deciding them.
- `placeLayout()` and `emitPlacement()` replace `renderLayoutNode` and `renderLayoutChildren`, which used to size, place and emit in one interleaved walk. Placement walks the layout with an explicit stack rather than by recursion.
- Boundary ports in `js/router.js`. A level reaches its own outer edge through a boundary row, which is one node spanning the bounds with zero height. Ports along it are spread by the same `assignPorts` that fans out a node edge, and a wire ending there takes no arrowhead and no place in a merge bus, because it continues at the level above. Tests "boundary ports fan out along the level edge" and "a boundary row sits flush with the level edge".
- `emitSection()` takes per-row heights, because a level whose rows are boxes has rows of different heights and a boundary row has none. Test "per-row heights put a gap below the row it belongs to".
- `getGutterPlan()` in `js/flowschem.js`. A container routes among its child boxes exactly as a section routes among its nodes, so the same `planSection` does both. A row container gives the router one row of boxes and a channel below it, a column container one box per row and the gaps between them.
- The headless harness checks gutters as well as sections. A gutter wire overlapping another, or crossing a box it only passes, now fails the run.
- Node-to-node wires that cross stacks route through every level they pass and join at each box edge. The parent level picks the X where a wire crosses a child's edge, and the child routes to a zero-width boundary node at that X. `planDiagram` sizes, places and joins up to four rounds until every level fits the room it reserved.
- Router connection flags `continuesFrom` and `continuesTo`. A wire that carries on inside a child box keeps its own port, joins no merge bus and takes no arrowhead at that end. Test "a wire that continues inside a box takes no arrow and no bus".
- The harness records where every wire meets a box edge and fails the run on an end with no partner across it.
- `test/fixtures/sidechannel.flow`, three boxes in a column with wires that skip the middle one, which exercises the side channel `getGutterPlan` reserves.

### Fixed

- A box joined to a node inside itself, such as `USV <> sensors:Xbee`, drew half a wire and dropped the rest silently. It is now reported as an error. Test "a box joined to a node inside it is reported, not half drawn".
- The last widening pass in `getSectionPlan` could widen without planning again, leaving wires at the old node positions.
- A column container's side channel was 4px short of one usable track, so wires skipping a row squeezed into one channel.
- `font-size: 14px` and other numeric style values with a unit made the page size `NaN`. Numeric style keys are now coerced to numbers.
- Section names are escaped before they reach the SVG.
- A junction dot was drawn where a merge bus ends. The member at either end of the bar meets it at a corner, not a T, so `C2 -> D1` in the dense fixture read as a join that is not there, and the corner under it was square. The end members now carry the bar themselves, which removes the false dot and rounds the corner. Regression test "a bus end carries no junction dot", `# WHY:` at `js/router.js:1030`.
- Cross-section wires render at all. No connection of any kind crossed a section boundary before, because `parseNodeLine` built every endpoint id with `generateNodeId(name, section)` from the block the line was written in, so no name could refer out of its own block. `Xbee <> RPi` created two phantom nodes rather than linking the real ones.
- A section that holds only a cross-section link no longer gains a phantom node for it. On `cross.flow` the `ground` box no longer contains a stray `XBEE`, and `Xbee <> Ground Station` reaches the real node in `sensors`.

### Changed

- `README.md` rewritten as usage only: run, file format, linking across sections and the settings that take effect. The previous design spec is kept at `dev/notes/original_readme_spec.md`.
- Pieces on the target side of a split net point inward, from the box edge to the node, so a unidirectional arrow lands on the real target.
- Section labels draw last, over a white backing, so a wire entering through a box's top edge passes behind the label rather than over it.
- `renderCrossSectionConnections` is deleted. Every wire is drawn by the level that routes it.
- Section-to-section wires draw. A wire between two boxes at one level, such as `USV <> ROV`, is now an ordinary net routed through that level's gutter. It drew nothing at all before, because both endpoints were looked up in `nodeMap` and a section name is not in it.
- Gutters are sized from the tracks they carry instead of a hardcoded 10px. `gap`, `padding` and the section label height were literals in both the sizing pass and the placement pass, required to agree; they are now `LAYOUT_GUTTER`, `LAYOUT_PADDING` and `SECTION_LABEL_HEIGHT`, read by one gutter plan that both passes share.
- `parseNodes` takes the parsed layout, so a block the layout never places is known to own no nodes. This is what lets a trailing block hold only links between stacks.
- `.claude/state/plan.md` gains an "Interconnecting stacks" design. The router runs again with boxes in place of nodes, so a section-to-section wire is an ordinary net and a cross-stack node wire splits through boundary ports allocated by the existing `assignPorts`.
- `.claude/state/plan.md` gains a "Gutter spacing" design, from a render review. Gutters are to be sized from the tracks they carry rather than the hardcoded 10px written twice today, and routing levels are one per layout container rather than two, because a wire splits once per container boundary it crosses.

### Superseded, kept for the trail

- The 2026-10-29 diagnosis blamed a `nodeMap` lookup missing section names at `js/flowschem.js:1260`. The reproduction fixture showed the cause was broader, and `USV <> ROV` was the same bug as the node-to-node case rather than a separate one.
- `renderCrossSectionConnections` was unreachable dead code until endpoint resolution landed: 0 of 21 parsed connections on `cross.flow` reached it with real geometry. It now runs, and draws cross-stack wires over whatever is in the way. It still does, for node-to-node wires only, until boundary ports are joined up across levels. Section 6 deletes it then.

## 2026-10-29

### Added

- `js/router.js`, a pure orthogonal channel router. Horizontal runs in a row gap are allocated tracks by the left-edge algorithm, and each crossing of a row band takes its own column in a free corridor between nodes. Two wires share a track only when their spans are disjoint or when they are the same merge bus.
- `findOverlaps()` and `findNodeCollisions()` in the router, so no-overlap is checked on every render rather than assumed.
- `test/router.test.js`, 22 unit tests covering the allocation primitives and the whole-section no-overlap property on three fixtures.
- `test/screenshot.js`, a headless Chrome harness that drives the real app, saves the SVG and PNG, and fails when the render contains a wire overlap or a wire through a node.
- `test/preview.js`, renders router fixtures to standalone SVG for inspection without the app.

### Changed

- Row pitch is uniform across the whole diagram. The gap needing the most channels sets the height for every gap, so rows line up between sections.
- Section content is centred in its box rather than stretched, which keeps node columns aligned between sections of the same content width.
- Ports fan out across a node edge up to 30px apart instead of always bunching at 12px.
- Wire corners are rounded.
- `assets/implementation_plan.md` is marked superseded, with the reason the phased approach stalled. The current design is in `.claude/state/plan.md`.

### Fixed

- Corridors between nodes came out exactly zero wide. The default column pitch was node width plus 20, while a node blocks its width plus twice the 10px clearance, and the two were equal. Every crossing collapsed onto the section edge, so any two pass-through wires landed on top of each other. The router now reports the content width its corridors need and `getSectionPlan` widens and replans until they fit.
- Vertical tracks are placed per row band, so a crossing of one band and a crossing of the next could be given the same column. Both were pinned, so the separation pass had to leave them coincident in the gap between the bands. A crossing may now slide anywhere inside its own corridor, which is clear of nodes by construction.
- `vTrackPitch` was documented as a minimum but only ever applied as a cap, so a narrow corridor stacked wires closer than the stroke width and they read as one line. It is now a floor whenever the corridor can hold it.
- Wires no longer overlap. The old router gave every route's final horizontal the same Y, so approach segments stacked on one line, and gave vertical runs no tracks at all, so two wires could share a column.
- Merge buses no longer span blindly from the leftmost to the rightmost source. A bus now holds one allocated track and nothing else is placed on it.
- Upward wires crossing a row band were registered against gaps that do not touch that band, so they were never de-conflicted and could share a column with a stub from the row above.
- Same-row connections in a single-row section were dropped silently. They now route through a trailing gap below the row, and the section reserves height for it.

### Review follow-ups

- Added `routeWithAppGeometry()` to the test suite. The original fixtures laid every row out across a fixed 900px span, while the real app derives width from the node count, so they could not see a corridor that was too narrow. Four regression tests now run at the app's own geometry.
- Added `test/fixtures/dense.flow`, which exercises pass-through wires in the real app. The demo fixture has almost none, so it never reached the corridor code.
- The router's self-check is quadratic in the segment count and used to run on every browser render. It is now gated on `window.ORCA_VERIFY`, which only the harness sets.
- Corrected Doxygen that overclaimed: the module header stated no two wires overlap without qualification, `emitSection` did not document `polylines` (the field callers actually draw from), and `planSection` omitted `hasTrailingGap` and `requiredContentWidth`.

### Removed

- `calculateGridHeight`, `buildConnectionRoutes`, `renderConnectionsInSection`, `renderNodesInSection` and the exit-position helpers, about 1400 lines replaced by the router and a thin rendering layer.
