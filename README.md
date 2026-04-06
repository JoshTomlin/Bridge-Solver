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

### JavaScript UI

```powershell
cd website
npm start
```
