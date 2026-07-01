# Bridge Solver

Bridge Solver is a local app for exploring bridge deals with a fast C++ engine and a JavaScript UI.

## Goal

The long-term plan is to:

1. Enter declarer and dummy hands in the UI.
2. Count legal East/West hand combinations under explicit restrictions.
3. Sample from those legal hands.
4. Run an alpha-mu style declarer-play search on sampled worlds instead of relying only on pure double-dummy analysis.
5. Extend the same sampling ideas to partner ranges for bidding decisions.

## Current Status

- JavaScript runtime detected: `node` and `npm`
- C++ toolchain detected on PATH: none yet
- Project scaffold created for a split UI/engine architecture

## Project Layout

- `website/` JavaScript app shell
- `engine/` C++ core library and CLI smoke test
- `docs/` planning notes and architecture

## First Steps

1. Install a Windows C++ toolchain.
2. Build the starter engine with CMake.
3. Run the website shell locally with Node.
4. Start implementing card, hand, and deal-restriction primitives in C++.

See `docs/architecture.md` for the development roadmap.

## Build Commands

### C++ Engine

Use the helper script from the repo root:

```powershell
.\build.ps1
```

Build Debug instead:

```powershell
.\build.ps1 -Configuration Debug
```

Build and run the starter CLI:

```powershell
.\build.ps1 -Run
```

### Interactive Position Lab

```powershell
.\build\engine\Release\bridge_engine_cli.exe --interactive
```

Use `new` to enter four equal-size hands in SHDC notation, such as
`AJ32.A.-.-`. Normal `show` output hides East and West; `reveal` displays the
source-of-truth deal. `analyze` samples defender layouts and runs alpha-mu.
`bot` plays alpha-mu for North/South and DDS for East/West.
Use `undo` to take back one card or `replay` to restart the entered deal.

Type `help` in the interface for the complete command list.
The default soft search limit is 5 seconds. Use `set time SECONDS` to adjust
it, or `set time 0` to disable it. A running iteration always finishes; the
limit prevents alpha-mu from starting the next `M`.

Use `optimizations` to list all search shortcuts, `set opt NAME on|off` to
toggle one, and `benchmark NAME` to run it off and on against the same sampled
worlds. `set audit on` prints the optimization events taken by `analyze`.
The implementation map and interpretation guide are in
`docs/alpha-mu-optimizations.md`.

### JavaScript UI

```powershell
cd website
npm start
```

The browser keeps the table and analysis visible while deal entry and search
settings live in modal editors. A play prefix such as `D6 DA D7 D4` can be
entered with the deal, or cards can be played manually before asking the bot to
finish from that exact position. Arrow controls review every card without
changing the live engine state.

Each analyzed root card exposes its reached M, Pareto strategies, sampled-world
win/loss grid, and the East/West holding in a selected world. Equal options are
shown explicitly. Deals, complete play timelines, analysis details, and timing
statistics are stored locally. The optional **Defender knowledge** editor adds
hard cards, forbidden cards, suit-length ranges, and HCP ranges.

Build the complete browser version after activating Emscripten:

```powershell
.\build-wasm.ps1
cd website
npm run preview
```

The production files are written to `website/dist`. Pushing `main` triggers
`.github/workflows/deploy-pages.yml`, which builds the WebAssembly module and
deploys that static directory to GitHub Pages. In the repository Pages settings,
select **GitHub Actions** as the source once before the first deployment.
