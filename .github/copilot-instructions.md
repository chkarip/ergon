# Ergon — Copilot Instructions

Last updated: 2026-05-10

Ergon is a local Electron desktop app that manages dev project paths and startup scripts. It lets you register projects, start/stop their servers, run git operations, and check port availability — all from one place.

---

## Features

> **Rules for Copilot:**
> - Before starting any task, check if the feature you are about to work on has an entry below. If it does not, add it first. If it does, read it before touching anything.
> - After finishing any task, update the entry — correct anything that changed and update the "Last touched" date.
> - Update the "Last updated" date at the top of this file after every session.

---

### Add / Edit / Delete Projects
**Last touched:** 2026-05-10
**What it is for:** Registering dev projects so Ergon can manage them.
**How it works:** The user clicks "Add Project", fills in a name, folder path, backend command, frontend command, port numbers, project type, and an optional colour. Saved projects appear as cards on the main screen. Any project can be edited via the pencil icon or deleted via the trash icon (with a confirmation step).

---

### Project Search and Filtering
**Last touched:** 2026-05-10
**What it is for:** Finding the right project quickly when many are registered.
**How it works:** A search box filters cards in real time by name or path. A status filter lets the user show only running projects, only stopped projects, or all projects.

---

### Project Types
**Last touched:** 2026-05-10
**What it is for:** Tailoring the card UI to the kind of project.
**How it works:** When adding a project the user picks Web (one dev server), Fullstack (separate backend + frontend servers), or Desktop (no dev server). The card shows the relevant start/stop controls for that type.

---

### Project Colours and Notes
**Last touched:** 2026-05-10
**What it is for:** Visual identification and quick personal reminders.
**How it works:** Each project can have a colour chosen from a palette; the card is accented with that colour. The user can also type a short inline note on the card that is saved with the project.

---

### Start / Stop Backend Server
**Last touched:** 2026-05-10
**What it is for:** Launching and stopping the backend process for a project.
**How it works:** Clicking "Start" (Backend) runs the configured command from the project's folder. The button switches to "Stop"; clicking Stop sends a graceful termination signal. Right-clicking Stop force-kills the process immediately.

---

### Start / Stop Frontend Server
**Last touched:** 2026-05-10
**What it is for:** Launching and stopping the frontend dev server for a project.
**How it works:** Same behaviour as the backend start/stop, but for the frontend command. Both backend and frontend can run simultaneously on the same project card.

---

### Real-time Process Output (Inline Console)
**Last touched:** 2026-05-10
**What it is for:** Seeing what a running server is printing without leaving Ergon.
**How it works:** While a process is running, its stdout and stderr stream live into a console panel inside the project card. The output auto-scrolls to the latest line.

---

### Process Status Monitoring
**Last touched:** 2026-05-10
**What it is for:** Keeping the UI accurate even if a process dies on its own.
**How it works:** Ergon polls process status every 5 seconds. A green dot on the card means at least one server is running; a grey dot means everything is stopped. The dot updates automatically without the user needing to refresh.

---

### Port Configuration
**Last touched:** 2026-05-10
**What it is for:** Controlling which ports the backend and frontend listen on.
**How it works:** The user enters port numbers when adding or editing a project. Ergon injects the PORT environment variable into every process. For known dev servers (Next.js, Vite, Webpack, React, Angular, Nuxt, Gatsby, Astro, SvelteKit) it also appends the appropriate --port flag automatically.

---

### Port Conflict Detection and Auto-suggestion
**Last touched:** 2026-05-10
**What it is for:** Preventing two projects from fighting over the same port.
**How it works:** Before starting a server Ergon checks whether the configured port is free. If it is already in use the user is warned and shown an alternative free port. In the Add/Edit form a "Suggest" button finds and fills in the next available port.

---

### Git Operations
**Last touched:** 2026-05-10
**What it is for:** Running common git commands without opening a terminal.
**How it works:** Each project card exposes buttons for Status, Pull, Commit (prompts for a message, then stages all and commits), Push, and Diff. Output from each operation appears inline on the card.

---

### Open in Explorer / Open Dev Server
**Last touched:** 2026-05-10
**What it is for:** Jumping from Ergon to related tools in one click.
**How it works:** Clicking the project path opens that folder in Windows Explorer. Clicking the dev server URL (shown when a server is running) opens it in the default browser. A copy button next to the URL puts the address on the clipboard.

---

### Data Persistence and Legacy Migration
**Last touched:** 2026-05-10
**What it is for:** Making sure projects survive restarts and upgrades.
**How it works:** All project data is saved to a local `projects.json` file in the OS app-data directory. On first launch after a rename Ergon checks old locations (`project-manager`, `Project Manager`) and migrates the file automatically.

---

### Auto-cleanup on Close
**Last touched:** 2026-05-10
**What it is for:** Preventing orphaned server processes after the app is closed.
**How it works:** When the user closes Ergon, all running backend and frontend processes are stopped automatically before the window disappears.

---

## Tech stack (brief)

- **Electron** (main + renderer, IPC via preload.js)
- **Vanilla JS / HTML / CSS** — no frontend framework
- **Node.js** built-ins: `child_process`, `fs`, `net`, `path`
- **electron-builder** for packaging

## File map

| File | Role |
|------|------|
| main.js | Main process — IPC handlers, process management, file storage |
| app.js | Renderer — UI logic |
| preload.js | Context bridge between main and renderer |
| index.html | App markup |
| styles.css | All styling |
| package.json | Dependencies and build config |
