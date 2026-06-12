# Ergon — Claude Code Guidelines

Last updated: 2026-06-12 (session: Master QA Guide integration)

Ergon is a local Electron desktop app that manages dev project paths and startup scripts. It lets you register projects, start/stop their servers, run git operations, and check port availability — all from one place.

---

## Features

> **Rules for Claude:**
> - Before starting any task, check if the feature you are about to work on has an entry below. If it does not, add it first. If it does, read it before touching anything.
> - After finishing any task, update the entry — correct anything that changed and update the "Last touched" date.
> - **Verification Requirement**: Before declaring any feature/bug completed, run the verification checks and copy-paste the pre-flight checklist defined in the master [QA_FOR_AGENTS.md](file:///d:/my%20apps/QA_FOR_AGENTS.md) at the workspace root.
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
**How it works:** Clicking the project path opens that folder in Windows Explorer. Clicking the dev server URL (shown when a server is running) opens it in the default browser. A copy button next to the URL puts the address on the clipboard. The compact **Launch** button also opens the app URL automatically 3 seconds after starting (uses frontendPort if set, otherwise backendPort; skipped for desktop/mobile project types).

---

### Data Persistence and Legacy Migration
**Last touched:** 2026-05-10
**What it is for:** Making sure projects survive restarts and upgrades.
**How it works:** All project data is saved to a local `projects.json` file in the OS app-data directory. On first launch after a rename Ergon checks old locations (`project-manager`, `Project Manager`) and migrates the file automatically.

---

### Auto-detect Device with Quick Swap and Emulator Boot
**Last touched:** 2026-05-10
**What it is for:** Targeting the right physical device or emulator from a mobile project card without opening a terminal.
**How it works:** On render, Ergon calls `adb devices -l` for any mobile project that has no stored device selection. If exactly one device is connected it is auto-selected silently. The card shows a pill-shaped "Target device" button with the selected device name (or "Select device ▾" when none is chosen). Clicking it opens a fixed-position popover that lists connected devices (from `adb devices -l`) and available AVDs (from `emulator -list-avds`). The user can select any connected device or boot a stopped AVD. The selected device is stored in `project.selectedDevice` (`{ id, name }`) and persisted in `projects.json`. All mobile commands (Run, Reload, Rebuild & Install) inject `--deviceId <id>` (react-native) or `-s <id>` (adb) when a device is selected. New IPC channels: `list-adb-devices`, `list-avds`, `boot-emulator`.

---

### Ergon Pinned Self-Project Card
**Last touched:** 2026-05-10
**What it is for:** Letting the user launch Ergon's own dev mode from inside Ergon, the same way they launch any other project.
**How it works:** A built-in project object (`ergonProject`, ID `__ergon__`) is always rendered first in the grid as a full-width card with a dark gradient background, animated accent bar, and the Ergon logo. Its path is resolved at startup via a `get-app-path` IPC call (`__dirname` in main.js). The dev command is `npm run dev`. The card has Start/Stop, status indicator, and live console output — identical behaviour to regular cards. It cannot be deleted or edited; `deleteProject` and `editProject` return early for `ERGON_ID`. A `findProject(id)` helper is used everywhere process management needs to resolve a project by ID, so the built-in card is handled alongside user projects without being stored in `projects.json`.

---

### AI Project Scan
**Last touched:** 2026-05-31
**What it is for:** Getting AI-powered bug and feature-idea insights for individual projects.
**How it works:** A "Scan Now" button on each project card sends the full codebase (excluding node_modules, .git, dist, etc.) to the DeepSeek API for analysis. The AI returns bugs and feature ideas with severity/priority. Results appear in a per-card preview and a full summary modal (🤖 badge in the header). The badge is shown whenever any project has scan results. Results persist in `projects.json` under `project.scanResults` until the next scan replaces them. API config is read from `~/.continue/config.yaml` (DeepSeek provider). IPC channel: `ai-scan-project`. Note: the automatic weekly scan was removed — scanning is manual only.

---

### Saved Scan Suggestions
**Last touched:** 2026-05-10
**What it is for:** Pinning individual AI scan findings so they survive future scans.
**How it works:** Every finding card in the AI results modal has a 🔖 bookmark icon (visible on hover). Clicking it saves that suggestion to `project.savedSuggestions` — an array stored in `projects.json` that is never touched by scans. Saved suggestions appear in a yellow "Saved" section at the top of each project block in the modal, clearly separated from fresh scan results. Clicking 🔖 again on a saved card removes it. Saved cards show the scan type (Bugs, Features, etc.) as a small label above them. `saveSuggestion(projectId, type, findingIndex)` looks up the item by index in `scanResults[type].findings` to avoid passing JSON through onclick attributes. `unsaveSuggestion(projectId, savedId)` removes by the generated UUID stored on save.

---

### Auto-cleanup on Close
**Last touched:** 2026-05-10
**What it is for:** Preventing orphaned server processes after the app is closed.
**How it works:** When the user closes Ergon, all running backend and frontend processes are stopped automatically before the window disappears.

---

### Open in Astrolabe
**Last touched:** 2026-05-31
**What it is for:** Bidirectional navigation between Ergon and Astrolabe (the AI canvas workspace), with support for manually linking Ergon projects to named Astrolabe workspaces even when their names differ.
**Ergon → Astrolabe (left-click 🔭):** Writes a handoff file (`ergon-astrolabe-handoff.json` in OS temp dir) and starts the Astrolabe process via Ergon's process manager. The handoff payload includes `{ name, path, timestamp }` plus either `astroProject` (the linked Astrolabe workspace name, if set) or `createNew: true` (to prompt the user to create a new workspace). Astrolabe reads this file and routes accordingly.
**Linking (right-click 🔭):** Opens a "Link Astrolabe Workspace" modal where the user types the Astrolabe project name to link to. The link is stored in `project.astroLinkedProject` in `projects.json`. Linked projects show a green dot on the 🔭 button. The link can be removed from the same modal.
**Astrolabe → Ergon:** Observatory header and canvas top-left panel both have a 🚀 Ergon button. Clicking calls `openUrl('ergon://')` from `@tauri-apps/plugin-opener`. Ergon registers the `ergon://` scheme via `app.setAsDefaultProtocolClient('ergon')` and uses `requestSingleInstanceLock` to bring its window to front. Known projects: Astrolabe at `d:\Astrolabe\astrolabe`, ChalkBlock (Expo/React Native) at `d:\ChalkBlock` — link: ChalkBlock → Chalkapp.

---

## Tech stack (brief)

- **Electron** (main + renderer, IPC via preload.js)
- **Vanilla JS / HTML / CSS** — no frontend framework
- **Node.js** built-ins: `child_process`, `fs`, `net`, `path`
- **electron-builder** for packaging

## File map

| File | Role |
|------|------|
| [main.js](main.js) | Main process — IPC handlers, process management, file storage |
| [app.js](app.js) | Renderer — UI logic |
| [preload.js](preload.js) | Context bridge between main and renderer |
| [index.html](index.html) | App markup |
| [styles.css](styles.css) | All styling |
| [package.json](package.json) | Dependencies and build config |
