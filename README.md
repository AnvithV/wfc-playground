# Wave Function Collapse Playground

Procedural tiling experiment powered by the Wave Function Collapse (WFC) algorithm.
The project ships a Node-based generator/CLI, an Express API, and an in-browser
visualizer that replays the solver timeline.
## Getting Started

1. Install dependencies: `npm install`
2. Run the server: `npm start`
3. Open `http://localhost:3000` in a browser.
4. Use keyboard shortcuts to explore:
   - `R`: regenerate with the current seed
   - `Space`: play/pause timeline
   - `← →`: scrub frames
   - `C`: toggle context-sensitive weighting
   - `N`: toggle noise-driven coherence bias
   - `P`: switch weighted vs least-used pattern heuristic
   - `L`: switch entropy vs spiral location heuristic
5. Click “Save PNG” to download the final layout.

## Techniques & Inspiration
| Member | Focus |
| --- | --- |
| Anvith | Core solver plumbing, Express API, tileset integration, and end-to-end debugging of the generator pipeline. |
| Adhya | Frontend experience (timeline visualizer, playback UX), documentation, and coordination around heuristics/tileset tuning. |

## Sources & References

- Maxim Gumin, *WaveFunctionCollapse* original implementation and documentation.  
- Benedikt Bitterli, “Better Resemblance without Bigger Patterns” (context-sensitive WFC heuristics).  
- “WaveFunctionCollapse: Content Generation via Constraint Solving and Machine Learning,” Proc. IEEE CIG 2016 (pattern/location heuristic experiments).  
- PNGJS documentation (image encoding) and MDN Web Docs for Fetch/AbortController patterns.
## Techniques & Inspiration

- Based on Maxim Gumin’s original Wave Function Collapse concept, adapted into a
  Node-friendly modular solver.
- Uses entropy/MRV heuristics combined with deterministic `Mulberry32` sampling
  to keep runs reproducible by seed.
- Adds a spiral location heuristic (Section IV.A) alongside entropy/scanline/MRV,
  switchable via keyboard shortcut.
- Applies the context-sensitive weighting strategy from “Better Resemblance
  without Bigger Patterns” so the generator prefers locally appropriate tiles
  instead of requiring larger pattern sizes.
- Adds two complementary coherence helpers: a selectable least-used pattern
  heuristic (Section IV.B) plus a noise-driven regional bias so the user can flip
  between base WFC and “improved coherence” on demand.
- Includes a separate usage balancer that keeps tile counts close to the source
  distribution, yielding smoother macro features even when the context heuristic
  is neutral.
- Compatibility propagation mirrors the reference algorithm: each ban updates
  per-direction counters so contradictions are detected immediately.
- Frame capture leverages the renderer on every recorded step, producing PNG
  data URLs plus constraint heatmaps that the frontend scrubs through while
  tinting unfinished cells by their remaining degrees of freedom.
- Frontend rework favors small, well-scoped controllers (state machine for
  playback, abortable fetch for generation, mode toggles) instead of ad-hoc DOM
  mutations so UI bugs are easier to reason about.
## Modular Components

### Generation Core (`src/`)

- `simpleTiledWfc.js`  
  Orchestrates a `Model` that wraps the solver loop (`run`, `observe`, `propagate`)
  plus the CLI entrypoint. It wires the tileset definition into `WaveState`,
  selects the requested heuristic, exposes a deterministic `run(seed, limit)`
  method, and records intermediate frames when a step-recorder is provided.

- `lib/wave-state.js`  
  Stores the actual wave (boolean possibilities per cell) alongside entropy
  bookkeeping, compatibility counters, and a stack used during propagation.
  It exposes `reset`, `sampleDistribution`, `ban`, and stack helpers that the
  model calls as it observes cells and propagates constraints.

- `lib/heuristics.js` & `lib/directions.js`  
  Provide the entropy/MRV/scanline node pickers plus utilities to walk neighbor
  cells. `forEachNeighbor` feeds propagation by mapping the model grid into
  neighbor indices, while `travel` and `OPPOSITE` keep directional logic DRY.

- `lib/random.js`  
  Houses `Mulberry32`, a tiny deterministic PRNG, and `weightedPick`, which the
  solver uses to choose the tile to observe based on the remaining weighted
  distribution.

- `lib/tiled-loader.js`  
  Parses `connects.xml`, expands tile symmetries, loads each PNG from `tileset/`,
  and constructs the adjacency propagator matrices that drive constraint checks.

- `lib/contextual-weights.js`  
  Implements the context-sensitive weighting strategy described in “Better
  Resemblance without Bigger Patterns.” It inspects each candidate cell’s current
  neighbor possibilities and boosts tiles whose adjacency frequencies from the
  sample better match that local context.

- `lib/noise-bias.js`  
  Generates a deterministic value-noise field that biases tiles toward consistent
  macro regions (configurable via keyboard shortcut). This acts as the “other
  coherence approach” that can be toggled on/off.

- `lib/pattern-selector.js`  
  Centralizes the pattern decision heuristics: the default weighted sampler and
  the “least used” strategy pulled from WFC Section IV.B. Selection mode is
  toggleable at runtime.

- `lib/coherence.js`  
  Tracks how often every tile has been chosen relative to the reference
  distribution and dynamically boosts underrepresented tiles while suppressing
  overused ones. This soft budget keeps large-scale structures cohesive without
  requiring bigger patterns.

- `lib/renderers.js`  
  Converts the current `Model` state to PNGs using `pngjs`. It renders either the
  fully observed tiles or averaged colors from the remaining superposition, which
  is how the visualizer gets intermediate frames.







