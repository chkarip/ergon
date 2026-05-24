const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const net = require('net');
const https = require('https');
const http = require('http');
let playwright = null; // lazy-loaded for Phase 2 deep scans

// Suppress EPIPE errors that occur when stdout/stderr have no attached terminal
process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
process.on('uncaughtException', (err) => { if (err.code !== 'EPIPE') throw err; });

let mainWindow;
const runningProcesses = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Kill all running processes before closing
  runningProcesses.forEach((process, id) => {
    if (process && !process.killed) {
      if (process.pid) {
        try {
          process.kill();
        } catch (err) {
          console.error('Error killing process:', err);
        }
      }
    }
  });
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Detect commands that accept --port flag directly
function injectsPortFlag(command) {
  return /next\s+dev|vite|webpack-dev-server|react-scripts\s+start|ng\s+serve|nuxt\s+dev|nuxt\s+start|gatsby\s+develop|astro\s+dev|svelte-kit\s+dev/i.test(command);
}

// --- AI Scan Helpers ---

// Read DeepSeek config from Continue config file
function getAIConfig() {
  try {
    const configPath = path.join(
      require('os').homedir(),
      '.continue',
      'config.yaml'
    );
    if (!fs.existsSync(configPath)) return { apiKey: null, model: null };
    const raw = fs.readFileSync(configPath, 'utf8');
    const keyMatch = raw.match(/apiKey:\s*(\S+)/);
    const modelMatch = raw.match(/model:\s*(\S+)/);
    return {
      apiKey: keyMatch ? keyMatch[1] : null,
      model: modelMatch ? modelMatch[1] : 'deepseek-v4-pro'
    };
  } catch (e) {
    return { apiKey: null, model: null };
  }
}

// File extensions to include in AI scan
const SCAN_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.rb', '.php',
  '.html', '.css', '.scss', '.less',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.sql', '.prisma', '.graphql',
  '.env.example', '.cfg', '.ini', '.conf'
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'venv', '.venv', 'env', '.env',
  'coverage', '.nyc_output', 'tmp', 'temp', '.cache', '.turbo',
  'out', '.output', 'target', 'vendor', '.idea', '.vscode',
  '.vs', '.gradle', 'bin', 'obj'
]);

const MAX_TOTAL_CHARS = 60000;

// README lookup for AI scan context
const README_CANDIDATES = ['README.md', 'README', 'readme.md', 'README.txt', 'README.rst', 'README.markdown'];

function findReadmeFile(projectPath) {
  for (const name of README_CANDIDATES) {
    const fullPath = path.join(projectPath, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.size < 100000) {
        return fs.readFileSync(fullPath, 'utf8');
      }
    } catch { /* file doesn't exist or not readable */ }
  }
  return null;
}

function gatherSourceFiles(projectPath) {
  const results = [];
  let totalChars = 0;

  function walk(dir, depth) {
    if (depth > 10 || totalChars >= MAX_TOTAL_CHARS) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (totalChars >= MAX_TOTAL_CHARS) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name), depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const fullName = entry.name.toLowerCase();
        const matchExt = SCAN_EXTENSIONS.has(ext) || SCAN_EXTENSIONS.has(fullName);
        if (!matchExt) continue;
        const fullPath = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 500000) continue; // skip files > 500KB
          const content = fs.readFileSync(fullPath, 'utf8');
          const relativePath = path.relative(projectPath, fullPath).replace(/\\/g, '/');
          const header = `\n### File: ${relativePath}\n\`\`\`\n`;
          const footer = '\n```\n';
          const block = header + content + footer;
          if (totalChars + block.length > MAX_TOTAL_CHARS + 5000) {
            // Truncate block to fit remaining space
            const remaining = Math.max(MAX_TOTAL_CHARS - totalChars - 100, 200);
            results.push(header + content.slice(0, remaining) + '\n... (truncated)\n```\n');
            totalChars = MAX_TOTAL_CHARS;
          } else {
            results.push(block);
            totalChars += block.length;
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(projectPath, 0);
  return results.join('');
}

// Uncapped version for deep scans — no 60K char limit
function gatherSourceFilesUncapped(projectPath) {
  const results = [];
  function walk(dir, depth) {
    if (depth > 10) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name), depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const fullName = entry.name.toLowerCase();
        const matchExt = SCAN_EXTENSIONS.has(ext) || SCAN_EXTENSIONS.has(fullName);
        if (!matchExt) continue;
        const fullPath = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 500000) continue;
          const content = fs.readFileSync(fullPath, 'utf8');
          const relativePath = path.relative(projectPath, fullPath).replace(/\\/g, '/');
          results.push(`\n### File: ${relativePath}\n\`\`\`\n${content}\n\`\`\`\n`);
        } catch { /* skip unreadable */ }
      }
    }
  }
  walk(projectPath, 0);
  return { combined: results.join(''), fileCount: results.length, totalChars: results.reduce((s, r) => s + r.length, 0) };
}

function tryLoadPlaywright() {
  if (playwright) return { chromium: playwright.chromium };
  try {
    playwright = require('playwright');
    return { chromium: playwright.chromium };
  } catch (e) {
    return { chromium: null, error: 'Playwright is not installed. Run: npx playwright install chromium' };
  }
}

function waitForServerReady(url, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      if (Date.now() - start > timeoutMs) return resolve(false);
      const req = http.get(url, (res) => { res.resume(); resolve(true); });
      req.on('error', () => setTimeout(poll, 1500));
      req.setTimeout(3000, () => { req.destroy(); setTimeout(poll, 1500); });
    };
    poll();
  });
}

async function extractPageContent(page) {
  return page.evaluate(() => {
    const title = document.title || '';
    const visibleText = (document.body ? document.body.innerText : '') || '';
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
      level: parseInt(h.tagName[1]), text: (h.textContent || '').trim().slice(0, 200)
    }));
    const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({
      text: (a.textContent || '').trim().slice(0, 100), href: a.getAttribute('href') || ''
    }));
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')).slice(0, 50).map(b => ({
      text: (b.textContent || b.value || b.getAttribute('aria-label') || '').trim().slice(0, 100),
      type: b.tagName.toLowerCase()
    }));
    const forms = Array.from(document.querySelectorAll('form')).slice(0, 10).map(f => ({
      action: f.getAttribute('action') || '',
      method: (f.getAttribute('method') || 'get').toUpperCase(),
      fields: Array.from(f.querySelectorAll('input, select, textarea')).slice(0, 20).map(field => ({
        name: field.getAttribute('name') || '',
        type: (field.getAttribute('type') || field.tagName.toLowerCase()).toLowerCase()
      }))
    }));
    return { title, visibleText: visibleText.slice(0, 20000), headings, links, buttons, forms };
  });
}

function formatPageContentForAI(pageCaptures) {
  if (!pageCaptures || pageCaptures.length === 0) return '';
  let out = '\n## Page Contents (from live browser navigation)\n\n';
  for (const pc of pageCaptures) {
    out += `### Page: ${pc.url}\n`;
    if (pc.title) out += `Title: ${pc.title}\n`;
    if (pc.content.headings && pc.content.headings.length > 0) {
      out += 'Headings:\n';
      pc.content.headings.forEach(h => out += `  ${'#'.repeat(h.level)} ${h.text}\n`);
    }
    if (pc.content.links && pc.content.links.length > 0) {
      out += `Links (${pc.content.links.length}):\n`;
      pc.content.links.slice(0, 20).forEach(l => out += `  - [${l.text}](${l.href})\n`);
    }
    if (pc.content.buttons && pc.content.buttons.length > 0) {
      out += `Buttons: ${pc.content.buttons.map(b => b.text).join(', ')}\n`;
    }
    if (pc.content.forms && pc.content.forms.length > 0) {
      out += `Forms (${pc.content.forms.length}): `;
      pc.content.forms.forEach(f => out += `  [${f.method} ${f.action}] fields: ${f.fields.map(ff => ff.name || ff.type).join(', ')}\n`);
    }
    if (pc.content.visibleText) {
      out += `\nVisible Text (first 1000 chars):\n${pc.content.visibleText.slice(0, 1000)}\n`;
    }
    out += '\n';
  }
  return out;
}

function callDeepSeekAPIRoadmap(systemPrompt, userPrompt) {
  return new Promise((resolve) => {
    const config = getAIConfig();
    if (!config.apiKey) {
      resolve({ success: false, error: 'AI configuration not found.' });
      return;
    }
    const body = JSON.stringify({
      model: config.model || 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    });
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            let errMsg = `API returned status ${res.statusCode}`;
            try { const errJson = JSON.parse(data); if (errJson.error && errJson.error.message) errMsg = errJson.error.message; } catch {}
            resolve({ success: false, error: errMsg });
            return;
          }
          const json = JSON.parse(data);
          const rawContent = json.choices?.[0]?.message?.content || '';
          let parsed;
          try { parsed = JSON.parse(rawContent); } catch {
            const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (fenceMatch) { parsed = JSON.parse(fenceMatch[1]); } else {
              resolve({ success: false, error: 'Failed to parse roadmap JSON' });
              return;
            }
          }
          resolve({ success: true, roadmap: parsed });
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse roadmap response: ' + e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ success: false, error: 'Network error: ' + e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Roadmap generation timed out' }); });
    req.write(body);
    req.end();
  });
}

async function runDeepScanPhase2(projectPath, roadmap, command, configPort, projectId, mainWindow) {
  const urls = (roadmap && roadmap.urls && roadmap.urls.length > 0) ? roadmap.urls : [{ path: '/', title: 'Root page' }];
  const screenshotsDir = path.join(app.getPath('userData'), 'deep-scan-screenshots', `${projectId}-${Date.now()}`);
  fs.mkdirSync(screenshotsDir, { recursive: true });

  // Find a free port
  let scanPort = configPort || 3000;
  const checkFree = (p) => new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => { s.close(); res(true); });
    s.listen(p, '127.0.0.1');
  });
  if (!(await checkFree(scanPort))) {
    for (let i = scanPort + 1; i < scanPort + 200; i++) {
      if (await checkFree(i)) { scanPort = i; break; }
    }
  }

  // Build command with port
  let finalCommand = command;
  const env = { ...process.env, PORT: String(scanPort) };
  if (injectsPortFlag(command)) {
    finalCommand = `${command} --port ${scanPort}`;
  }

  // Start server
  let proc = null;
  try {
    proc = spawn(finalCommand, [], { cwd: projectPath, shell: true, env, stdio: 'pipe' });
  } catch (e) {
    return { success: false, error: 'Failed to start project server: ' + e.message, pageCaptures: [], screenshotsDir };
  }

  mainWindow.webContents.send('deep-scan-progress', {
    projectId, phase: 'phase2', detail: 'Waiting for server to be ready...'
  });

  const baseUrl = `http://127.0.0.1:${scanPort}`;
  const ready = await waitForServerReady(baseUrl, 60000);
  const pageCaptures = [];

  if (ready) {
    const pw = tryLoadPlaywright();
    if (!pw.chromium) {
      try { proc.kill(); } catch {}
      return { success: false, error: 'Playwright not installed. Run: npx playwright install chromium', pageCaptures: [], screenshotsDir };
    }

    let browser = null;
    try {
      browser = await pw.chromium.launch({ headless: true });
      for (let i = 0; i < urls.length; i++) {
        const urlPath = urls[i].path.startsWith('/') ? urls[i].path : '/' + urls[i].path;
        const fullUrl = `${baseUrl}${urlPath}`;
        mainWindow.webContents.send('deep-scan-progress', {
          projectId, phase: 'phase2', detail: `Navigating to ${urlPath}...`,
          url: fullUrl, pageIndex: i, totalPages: urls.length
        });
        let context = null;
        try {
          context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
          const page = await context.newPage();
          await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(1500);
          const content = await extractPageContent(page);
          const safeName = urlPath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
          const screenshotPath = path.join(screenshotsDir, `screenshot-${i}-${safeName}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          pageCaptures.push({ url: urlPath, fullUrl, title: content.title || urls[i].title || urlPath, content, screenshotPath });
        } catch (navErr) {
          mainWindow.webContents.send('deep-scan-progress', {
            projectId, phase: 'phase2', detail: `Failed to navigate ${urlPath}: ${navErr.message}`
          });
        } finally {
          try { if (context) await context.close(); } catch {}
        }
      }
    } catch (browserErr) {
      mainWindow.webContents.send('deep-scan-progress', {
        projectId, phase: 'phase2', detail: `Browser error: ${browserErr.message}`
      });
    } finally {
      try { if (browser) await browser.close(); } catch {}
    }
  }

  // Stop server
  try {
    if (proc && !proc.killed) {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${proc.pid} /T /F`);
      } else {
        proc.kill('SIGTERM');
      }
    }
  } catch {}

  return { success: true, pageCaptures, screenshotsDir, port: scanPort, serverReady: ready };
}

function callDeepSeekAPI(systemPrompt, userPrompt) {
  return new Promise((resolve) => {
    const config = getAIConfig();
    if (!config.apiKey) {
      resolve({ success: false, error: 'AI configuration not found. Check ~/.continue/config.yaml' });
      return;
    }

    const body = JSON.stringify({
      model: config.model || 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    });

    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            let errMsg = `API returned status ${res.statusCode}`;
            try {
              const errJson = JSON.parse(data);
              if (errJson.error && errJson.error.message) errMsg = errJson.error.message;
            } catch {}
            resolve({ success: false, error: errMsg });
            return;
          }
          const json = JSON.parse(data);
          const rawContent = json.choices && json.choices[0] && json.choices[0].message
            ? json.choices[0].message.content
            : '';
          // Try direct JSON parse first, then extract from markdown fence
          let parsed;
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (fenceMatch) {
              parsed = JSON.parse(fenceMatch[1]);
            } else {
              resolve({ success: false, error: 'Failed to parse AI response as JSON' });
              return;
            }
          }
          resolve({
            success: true,
            results: {
              ...parsed,
              scannedAt: Date.now()
            }
          });
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse API response: ' + e.message });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: 'Network error: ' + e.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'AI scan timed out after 120 seconds' });
    });

    req.write(body);
    req.end();
  });
}

const AI_SYSTEM_PROMPTS = {
  general: `You are an expert code reviewer. Analyze the provided codebase and identify bugs, issues, and feature ideas. Return ONLY a valid JSON object with this exact structure:

{
  "bugs": [
    {
      "title": "Short bug title",
      "description": "What the bug is and why it matters",
      "severity": "high" | "medium" | "low",
      "file": "path/to/file.ext"
    }
  ],
  "features": [
    {
      "title": "Short feature idea",
      "description": "What to build and why it would help",
      "priority": "high" | "medium" | "low",
      "file": "path/to/file.ext or empty string"
    }
  ]
}

Rules:
- bugs: real problems that could cause errors, crashes, security issues, or incorrect behavior
- features: practical improvements, missing functionality, refactoring opportunities
- severity/priority: "high" means critical or high-impact, "medium" means important, "low" means nice-to-have
- Return 2-5 bugs and 2-5 features. If you genuinely find none, return empty arrays.
- Be specific and actionable. Include relevant file paths.`,

  bugs: `You are an expert bug hunter. Analyze the provided codebase for bugs, errors, crashes, and incorrect behavior. Return ONLY a valid JSON object:

{
  "findings": [
    {
      "title": "Short bug title",
      "description": "What the bug is and why it matters",
      "severity": "high" | "medium" | "low",
      "file": "path/to/file.ext",
      "screen": "/path/of/page"
    }
  ]
}

Rules:
- severity: "high" means critical/crash, "medium" means important, "low" means minor
- Return 2-5 findings. If you find none, return empty array.
- Be specific and actionable. Include relevant file paths.
- Each finding MUST include a "file" field AND/OR a "screen" field (URL path of the page where the issue is visible). At least one must be non-empty.`,

  security: `You are an expert security auditor. Analyze the provided codebase for security vulnerabilities, injection risks, authentication weaknesses, exposed secrets, unsafe deserialization, and other security concerns. Return ONLY a valid JSON object:

{
  "findings": [
    {
      "title": "Short vulnerability title",
      "description": "What the vulnerability is and why it matters",
      "severity": "high" | "medium" | "low",
      "file": "path/to/file.ext",
      "screen": "/path/of/page"
    }
  ]
}

Rules:
- severity: "high" means exploitable/data-leak, "medium" means important risk, "low" means hardening
- Look for: hardcoded secrets, SQL/XSS injection, unsafe eval, missing auth checks, insecure dependencies, CSRF, path traversal
- Return 2-5 findings. If you find none, return empty array.
- Be specific and actionable. Include relevant file paths.
- Each finding MUST include a "file" field AND/OR a "screen" field (URL path of the page where the issue is visible). At least one must be non-empty.`,

  features: `You are an expert product strategist. Analyze the provided codebase for feature ideas, UX improvements, missing functionality, and refactoring opportunities. Return ONLY a valid JSON object:

{
  "findings": [
    {
      "title": "Short feature idea",
      "description": "What to build and why it would help",
      "priority": "high" | "medium" | "low",
      "file": "path/to/file.ext or empty string",
      "screen": "/path/of/page"
    }
  ]
}

Rules:
- priority: "high" means high-impact, "medium" means valuable, "low" means nice-to-have
- Consider: user experience, developer experience, scalability, maintainability
- Return 2-5 findings. If you find none, return empty array.
- Be specific and actionable. Include relevant file paths where applicable.
- Each finding MUST include a "file" field AND/OR a "screen" field (URL path of the page where the suggestion applies). At least one must be non-empty.`,

  performance: `You are an expert performance engineer. Analyze the provided codebase for performance issues, bottlenecks, memory leaks, slow operations, and inefficient algorithms. Return ONLY a valid JSON object:

{
  "findings": [
    {
      "title": "Short performance issue title",
      "description": "What the issue is and why it matters",
      "severity": "high" | "medium" | "low",
      "file": "path/to/file.ext",
      "screen": "/path/of/page"
    }
  ]
}

Rules:
- severity: "high" means significant slowdown/memory issue, "medium" means noteworthy, "low" means minor optimization
- Look for: N+1 queries, missing caching, blocking operations, large bundle sizes, excessive re-renders, unoptimized loops, memory leaks
- Return 2-5 findings. If you find none, return empty array.
- Be specific and actionable. Include relevant file paths.
- Each finding MUST include a "file" field AND/OR a "screen" field (URL path of the page where the issue is visible). At least one must be non-empty.`,

  roadmap: `You are an expert codebase navigator. Analyze the provided source files and produce a list of URL paths/screens that should exist in this application. Look for route definitions, page components, view templates, and navigation structures.

Return ONLY a valid JSON object:
{
  "urls": [
    { "path": "/", "title": "Home page" },
    { "path": "/about", "title": "About page" }
  ],
  "summary": "Brief description of what this application does and its main user-facing pages."
}

Rules:
- Each URL path must start with "/"
- Deduplicate paths and only include meaningful user-facing pages (not API endpoints or static assets)
- Order from most important to least important
- Include 3-10 URLs. If you cannot determine specific routes, return at least [{ "path": "/", "title": "Root page" }].
- Use realistic titles based on what each page likely shows.`
};

// --- End AI Scan Helpers ---

ipcMain.handle('start-process', async (event, { id, command, cwd, port }) => {
  return new Promise((resolve) => {
    try {
      // Kill existing process if running
      if (runningProcesses.has(id)) {
        const existingProcess = runningProcesses.get(id);
        if (existingProcess && !existingProcess.killed) {
          existingProcess.kill();
        }
      }

      // Build final command and env with port injection
      let finalCommand = command;
      const env = { ...process.env };
      if (port) {
        env.PORT = String(port);
        if (injectsPortFlag(command)) {
          finalCommand = `${command} --port ${port}`;
        }
      }

      // Start new process
      const childProcess = spawn(finalCommand, [], {
        cwd: cwd,
        shell: true,
        detached: false,
        env
      });

      runningProcesses.set(id, childProcess);

      childProcess.stdout.on('data', (data) => {
        mainWindow.webContents.send('process-output', {
          id,
          output: data.toString(),
          type: 'stdout'
        });
      });

      childProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('process-output', {
          id,
          output: data.toString(),
          type: 'stderr'
        });
      });

      childProcess.on('close', (code) => {
        runningProcesses.delete(id);
        mainWindow.webContents.send('process-stopped', { id, code });
      });

      childProcess.on('error', (error) => {
        runningProcesses.delete(id);
        mainWindow.webContents.send('process-error', { id, error: error.message });
      });

      resolve({ success: true, pid: childProcess.pid });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
});

ipcMain.handle('stop-process', async (event, id) => {
  try {
    if (runningProcesses.has(id)) {
      const proc = runningProcesses.get(id);
      if (proc && !proc.killed) {
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${proc.pid} /T /F`);
        } else {
          proc.kill('SIGTERM');
        }
        runningProcesses.delete(id);
        return { success: true };
      }
    }
    return { success: false, error: 'Process not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-process-status', async (event, pid) => {
  try {
    if (!pid) return { isRunning: false };
    
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { stdio: 'pipe' }).toString();
        return { isRunning: output.toLowerCase().includes(pid.toString()) };
      } catch (error) {
        return { isRunning: false };
      }
    } else {
      // On Unix-like systems, use ps
      try {
        const { execSync } = require('child_process');
        execSync(`ps -p ${pid} > /dev/null 2>&1`);
        return { isRunning: true };
      } catch (error) {
        return { isRunning: false };
      }
    }
  } catch (error) {
    return { isRunning: false, error: error.message };
  }
});

ipcMain.handle('force-stop-process', async (event, pid) => {
  try {
    if (!pid) return { success: false, error: 'No PID provided' };
    
    // On Windows, use taskkill with force
    if (process.platform === 'win32') {
      const { exec } = require('child_process');
      exec(`taskkill /pid ${pid} /T /F`, (error, stdout, stderr) => {
        // This is async, but we'll return success immediately
      });
    } else {
      // On Unix-like systems, use kill -9
      const { exec } = require('child_process');
      exec(`kill -9 ${pid}`, (error, stdout, stderr) => {
        // This is async, but we'll return success immediately
      });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-path-exists', async (event, folderPath) => {
  try {
    return fs.existsSync(folderPath);
  } catch (error) {
    return false;
  }
});

ipcMain.handle('save-projects', async (event, projects) => {
  try {
    const userDataPath = app.getPath('userData');
    const projectsFile = path.join(userDataPath, 'projects.json');
    fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-port', (event, port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve({ inUse: true }));
    server.once('listening', () => { server.close(); resolve({ inUse: false }); });
    server.listen(parseInt(port), '127.0.0.1');
  });
});

ipcMain.handle('find-free-port', async (event, startPort) => {
  const checkFree = (p) => new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(p, '127.0.0.1');
  });

  let p = parseInt(startPort) || 3000;
  for (let i = 0; i < 200; i++, p++) {
    if (await checkFree(p)) return { port: p };
  }
  return { port: null, error: 'No free port found in range' };
});

ipcMain.handle('load-projects', async (event) => {
  try {
    const userDataPath = app.getPath('userData');
    const projectsFile = path.join(userDataPath, 'projects.json');
    if (fs.existsSync(projectsFile)) {
      const data = fs.readFileSync(projectsFile, 'utf8');
      return { success: true, projects: JSON.parse(data) };
    }
    return { success: true, projects: [] };
  } catch (error) {
    return { success: false, error: error.message, projects: [] };
  }
});

// Git Integration Handlers
ipcMain.handle('git-status', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git status --porcelain', { cwd: projectPath }, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        resolve({ success: false, error: error.message });
        return;
      }
      resolve({ success: true, status: stdout.trim() });
    });
  });
});

ipcMain.handle('git-commit', async (event, { projectPath, message }) => {
  return new Promise((resolve) => {
    const commands = [
      'git add .',
      `git commit -m "${message.replace(/"/g, '\\"')}"`
    ];
    
    exec(commands.join(' && '), { cwd: projectPath }, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        resolve({ success: false, error: error.message });
        return;
      }
      resolve({ success: true, output: stdout + stderr });
    });
  });
});

ipcMain.handle('git-push', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git push', { cwd: projectPath }, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        resolve({ success: false, error: error.message });
        return;
      }
      resolve({ success: true, output: stdout + stderr });
    });
  });
});

ipcMain.handle('git-pull', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git pull', { cwd: projectPath }, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        resolve({ success: false, error: error.message });
        return;
      }
      resolve({ success: true, output: stdout + stderr });
    });
  });
});

ipcMain.handle('git-diff', async (event, projectPath) => {
  return new Promise((resolve) => {
    exec('git diff', { cwd: projectPath }, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        resolve({ success: false, error: error.message });
        return;
      }
      resolve({ success: true, diff: stdout });
    });
  });
});

ipcMain.handle('check-git-repo', async (event, projectPath) => {
  try {
    const gitDir = path.join(projectPath, '.git');
    const stat = fs.statSync(gitDir);
    return { hasGit: stat.isDirectory() };
  } catch {
    return { hasGit: false };
  }
});

// AI Scan Handlers

// Deep Scan Handler — full 3-phase scan (code read + Playwright tour + focused analysis)
ipcMain.handle('deep-scan-project', async (event, projectPath, scanType, options) => {
  const { projectId, projectType, command, configPort } = options || {};
  const st = scanType || 'bugs';
  const win = mainWindow;

  try {
    console.log(`[Deep Scan] Starting '${st}' deep scan for: ${projectPath}`);

    // --- Phase 1: Deep Read & Roadmap ---
    win.webContents.send('deep-scan-progress', {
      projectId, phase: 'phase1', detail: 'Reading all source files...'
    });

    const readme = findReadmeFile(projectPath);
    const filesResult = gatherSourceFilesUncapped(projectPath);
    console.log(`[Deep Scan] Phase 1 — ${filesResult.fileCount} files, ${filesResult.totalChars} chars`);

    if (!filesResult.combined.trim() && !readme) {
      win.webContents.send('deep-scan-progress', {
        projectId, phase: 'complete', findings: []
      });
      return {
        success: true,
        results: { type: st, findings: [], scannedAt: Date.now(), roadmap: null, pageCaptures: [], screenshotsDir: null }
      };
    }

    win.webContents.send('deep-scan-progress', {
      projectId, phase: 'phase1', detail: 'Generating navigation roadmap from code...'
    });

    let roadmapPrompt = '';
    if (readme) roadmapPrompt += `## Project README\n\n${readme}\n\n`;
    roadmapPrompt += `## Source Files\n\n${filesResult.combined}`;

    const roadmapResult = await callDeepSeekAPIRoadmap(AI_SYSTEM_PROMPTS.roadmap, roadmapPrompt);
    let roadmap = null;
    if (roadmapResult.success && roadmapResult.roadmap) {
      roadmap = roadmapResult.roadmap;
      console.log(`[Deep Scan] Roadmap generated: ${(roadmap.urls || []).length} URLs — ${(roadmap.urls || []).map(u => u.path).join(', ')}`);
    } else {
      console.log(`[Deep Scan] Roadmap failed, falling back to root: ${roadmapResult.error || 'unknown'}`);
      roadmap = { urls: [{ path: '/', title: 'Root page' }], summary: 'Roadmap generation failed' };
    }

    // --- Phase 2: Playwright Tour ---
    let pageCaptures = [];
    let screenshotsDir = null;
    const skipPhases = projectType === 'desktop' || projectType === 'mobile';

    if (!skipPhases && command && command.trim()) {
      win.webContents.send('deep-scan-progress', {
        projectId, phase: 'phase2', detail: 'Starting server on dedicated port...'
      });

      const phase2Result = await runDeepScanPhase2(projectPath, roadmap, command, configPort, projectId, win);
      pageCaptures = phase2Result.pageCaptures || [];
      screenshotsDir = phase2Result.screenshotsDir || null;
      console.log(`[Deep Scan] Phase 2 — ${pageCaptures.length} pages captured`);
    } else {
      const reason = skipPhases ? 'desktop/mobile project' : 'no start command configured';
      console.log(`[Deep Scan] Phase 2 skipped — ${reason}`);
      win.webContents.send('deep-scan-progress', {
        projectId, phase: 'phase2-skipped', detail: `Skipping browser tour (${reason})`
      });
    }

    // --- Phase 3: Focused Analysis ---
    win.webContents.send('deep-scan-progress', {
      projectId, phase: 'phase3', detail: 'Running focused analysis with full context...'
    });

    const systemPrompt = AI_SYSTEM_PROMPTS[st] || AI_SYSTEM_PROMPTS.bugs;

    let userPrompt = '';
    if (readme) userPrompt += `## Project README (context)\n\n${readme}\n\n`;
    userPrompt += `## Source Files\n\n${filesResult.combined}`;
    if (pageCaptures.length > 0) {
      userPrompt += '\n' + formatPageContentForAI(pageCaptures);
    }
    if (roadmap && roadmap.summary) {
      userPrompt += `\n## Application Overview\n\n${roadmap.summary}\n`;
    }

    console.log(`[Deep Scan] Phase 3 — Sending ${userPrompt.length} chars to DeepSeek...`);
    const result = await callDeepSeekAPI(systemPrompt, userPrompt);

    if (result.success) {
      const findings = Array.isArray(result.results.findings) ? result.results.findings : [];
      console.log(`[Deep Scan] Complete — ${findings.length} findings`);
      win.webContents.send('deep-scan-progress', {
        projectId, phase: 'complete', findings, roadmap, pageCaptures, screenshotsDir
      });
      return {
        success: true,
        results: {
          type: st,
          findings,
          scannedAt: Date.now(),
          roadmap,
          pageCaptures,
          screenshotsDir
        }
      };
    }
    win.webContents.send('deep-scan-progress', {
      projectId, phase: 'error', detail: result.error
    });
    return result;
  } catch (error) {
    console.error('[Deep Scan] Exception:', error.message);
    win.webContents.send('deep-scan-progress', {
      projectId, phase: 'error', detail: error.message
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-scan-project', async (event, projectPath, scanType) => {
  try {
    const st = scanType || 'general';
    console.log(`[AI Scan] Starting '${st}' scan for: ${projectPath}`);

    const readme = findReadmeFile(projectPath);
    console.log(`[AI Scan] README found: ${readme ? `yes (${readme.length} chars)` : 'no'}`);

    const files = gatherSourceFiles(projectPath);
    const fileCount = (files.match(/^### File:/gm) || []).length;
    console.log(`[AI Scan] Source files gathered: ${fileCount} files, ${files.length} total chars`);

    const systemPrompt = AI_SYSTEM_PROMPTS[st] || AI_SYSTEM_PROMPTS.general;

    let userPrompt = '';
    if (readme) {
      userPrompt += `## Project README (context for understanding the project)\n\n${readme}\n\n`;
    }
    if (files.trim()) {
      userPrompt += `## Source Files\n\n${files}`;
    }
    if (!userPrompt.trim()) {
      console.log('[AI Scan] No content to scan — returning empty');
      return { success: true, results: { type: st, findings: [], scannedAt: Date.now() } };
    }

    console.log(`[AI Scan] Sending ${userPrompt.length} chars to DeepSeek API...`);
    const preface = readme
      ? `Analyze the following codebase. Use the README above for project context — understand what the project is before making suggestions.\n\n${userPrompt}`
      : userPrompt;

    const result = await callDeepSeekAPI(systemPrompt, preface);
    console.log(`[AI Scan] API result: ${result.success ? `success (${(result.results.findings || []).length} findings)` : `error: ${result.error}`}`);

    if (result.success) {
      return {
        success: true,
        results: {
          type: st,
          findings: Array.isArray(result.results.findings) ? result.results.findings : [],
          scannedAt: result.results.scannedAt || Date.now()
        }
      };
    }
    return result;
  } catch (error) {
    console.error('[AI Scan] Exception:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-scan-all', async (event, projectPaths) => {
  try {
    const results = {};
    for (const pPath of projectPaths) {
      try {
        const readme = findReadmeFile(pPath);
        const files = gatherSourceFiles(pPath);
        const systemPrompt = AI_SYSTEM_PROMPTS.general;

        let userPrompt = '';
        if (readme) userPrompt += `## Project README\n\n${readme}\n\n`;
        if (files.trim()) userPrompt += `## Source Files\n\n${files}`;

        if (!userPrompt.trim()) {
          results[pPath] = {
            bugs: { findings: [], scannedAt: Date.now() },
            features: { findings: [], scannedAt: Date.now() }
          };
        } else {
          const scanResult = await callDeepSeekAPI(systemPrompt, userPrompt);
          if (scanResult.success) {
            const ts = scanResult.results.scannedAt || Date.now();
            results[pPath] = {
              bugs: { findings: Array.isArray(scanResult.results.bugs) ? scanResult.results.bugs : [], scannedAt: ts },
              features: { findings: Array.isArray(scanResult.results.features) ? scanResult.results.features : [], scannedAt: ts }
            };
          } else {
            results[pPath] = {
              bugs: { findings: [], scannedAt: Date.now(), error: scanResult.error },
              features: { findings: [], scannedAt: Date.now(), error: scanResult.error }
            };
          }
        }
      } catch (err) {
        results[pPath] = {
          bugs: { findings: [], scannedAt: Date.now(), error: err.message },
          features: { findings: [], scannedAt: Date.now(), error: err.message }
        };
      }
    }
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-check-scan-due', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const metaFile = path.join(userDataPath, 'scan-meta.json');
    if (!fs.existsSync(metaFile)) {
      return { due: true, lastScanAt: null };
    }
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const due = !meta.lastWeeklyScanAt || (Date.now() - meta.lastWeeklyScanAt) >= ONE_WEEK_MS;
    return { due, lastScanAt: meta.lastWeeklyScanAt || null };
  } catch (error) {
    return { due: true, lastScanAt: null, error: error.message };
  }
});

ipcMain.handle('ai-mark-scan-complete', async (event, { lastScanAt, badgeVisible }) => {
  try {
    const userDataPath = app.getPath('userData');
    const metaFile = path.join(userDataPath, 'scan-meta.json');
    const current = {};
    if (fs.existsSync(metaFile)) {
      try { Object.assign(current, JSON.parse(fs.readFileSync(metaFile, 'utf8'))); } catch {}
    }
    current.lastWeeklyScanAt = lastScanAt || current.lastWeeklyScanAt || Date.now();
    current.scanBadgeVisible = badgeVisible;
    fs.writeFileSync(metaFile, JSON.stringify(current, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-path', async () => {
  return { path: __dirname };
});
