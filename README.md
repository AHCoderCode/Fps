# Arcfield — Arena FPS

A fast, stylized first-person arena shooter built with Three.js and Vite. The repository started as an empty Node-oriented starter, so the game is implemented as a browser-based 3D project.

## Play locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create and preview a production build:

```bash
npm run check
npm test
npm run build
npm run preview
```

## Current game mode

This release is an offline bot match. No multiplayer service or authoritative game server is configured in this repository, so the interface does not present bots as real online players.

- One original, compact arena with connected routes and cover.
- Five AI opponents and four difficulty profiles: Easy, Normal, Hard, Expert.
- Fixed starter arsenal: assault rifle, sniper rifle, handgun, revolver, and melee knife.
- Two stylized utility effects: an area burst and a temporary area-control field.
- Match timer, score limit, respawns, scoreboard, pause, rematch, and settings.
- Procedurally generated geometry and synthesized interface/game feedback; no third-party art assets required.

Weapon and utility effects are intentionally arcade-like and non-graphic. Their behavior is a game abstraction rather than a real-world weapon simulation.

## Controls

| Action | Desktop |
|---|---|
| Move | WASD |
| Aim | Mouse |
| Fire | Left mouse button |
| Focus / zoom | Right mouse button |
| Jump | Space |
| Sprint | Shift |
| Reload | R |
| Weapons | 1–5 or mouse wheel |
| Grenade utility | G |
| Area-control utility | H |
| Scoreboard | Tab |
| Pause | Escape |

Touch controls are shown on supported touch devices.

## Performance notes

The renderer uses capped device pixel ratio, reusable procedural geometry/materials, no real-time shadow maps, bounded bot decision updates, and a compact arena. A 60 FPS target is a design goal, not a benchmark claim: the actual frame rate depends on browser, GPU, display resolution, and device load.

## Project checks

The GitHub Actions workflow runs JavaScript syntax checks, Node unit tests, and a Vite production build on pushes and pull requests. Browser-level gameplay and multiplayer load testing require a real browser/device test environment; no such result is claimed by the repository CI workflow.

## Multiplayer status

Online multiplayer is not implemented. A proper online mode requires a persistent authoritative match server, matchmaking/lobby lifecycle, state replication, and server-validated combat. Until that infrastructure exists, the playable mode uses local AI opponents only.
