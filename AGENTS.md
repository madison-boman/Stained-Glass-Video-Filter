# AGENTS.md

## Project overview

Digital Stained Glass is a browser-based web app (Vite + vanilla JS) that transforms a live camera feed—or an animated demo scene—into a real-time stained glass effect. Image processing runs entirely in the browser.

## Cursor Cloud specific instructions

### Services

| Service | Command | Port |
|---------|---------|------|
| Vite dev server | `npm run dev` | 5173 |

No database, Docker, or backend services are required.

### Common commands

- Install deps: `npm install`
- Dev server: `npm run dev` (binds `0.0.0.0:5173`)
- Lint: `npm run lint`
- Tests: `npm test`
- Production build: `npm run build`
- Preview build: `npm run preview`

### Camera vs demo mode

- Camera access requires a secure context (`localhost` or HTTPS). The Vite dev server on `localhost:5173` satisfies this.
- Cloud VMs typically have no webcam. On load, the app falls back to **demo mode** (animated gradient scene) so the stained-glass pipeline can still be exercised without `getUserMedia`.
- Use the **Start camera** button when a real camera is available.

### Dev server in tmux

For long-running dev sessions, start the server in tmux:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s vite-dev-server -c /workspace -- npm run dev
```

### Testing notes

- Unit tests use `vitest` with `jsdom`. Canvas rendering tests rely on the `canvas` npm package (native addon); `npm install` must complete successfully for `renderStainedGlass` integration tests to pass.
