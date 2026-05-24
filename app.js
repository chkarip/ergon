// Ergon — Renderer Bootstrap
// All modules loaded via <script> tags in index.html before this file.

// DOM Elements
const projectsGrid = document.getElementById('projectsGrid');
const emptyState = document.getElementById('emptyState');
const addProjectBtn = document.getElementById('addProjectBtn');
const projectModal = document.getElementById('projectModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');
const projectForm = document.getElementById('projectForm');
const modalTitle = document.getElementById('modalTitle');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');

// Add Project button
addProjectBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  editingProjectId = null;
  modalTitle.textContent = 'Add New Project';
  projectForm.reset();

  const backendResult = await window.electronAPI.findFreePort(3000);
  const backendSuggested = backendResult.port || 3000;
  document.getElementById('backendPort').value = backendSuggested;
  const frontendResult = await window.electronAPI.findFreePort(backendSuggested + 1);
  document.getElementById('frontendPort').value = frontendResult.port || backendSuggested + 1;

  projectModal.style.display = 'flex';
  projectModal.classList.add('show');
});

// Modal close handlers
closeModalBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
projectModal.addEventListener('click', (e) => {
  if (e.target === projectModal) closeModal();
});

// AI Results Modal event listeners
const aiResultsModal = document.getElementById('aiResultsModal');
document.getElementById('aiCloseModalBtn').addEventListener('click', closeAIResultsModal);
aiResultsModal.addEventListener('click', (e) => {
  if (e.target === aiResultsModal) closeAIResultsModal();
});

// Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const aiModal = document.getElementById('aiResultsModal');
    if (aiModal && aiModal.classList.contains('show')) {
      closeAIResultsModal();
    } else {
      closeModal();
    }
  }
});

// Project form submission
projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('projectName').value.trim();
  const path = document.getElementById('projectPath').value.trim();
  const backendCommand = document.getElementById('backendCommand').value.trim();
  const backendPort = document.getElementById('backendPort').value.trim();
  const frontendCommand = document.getElementById('frontendCommand').value.trim();
  const frontendPort = document.getElementById('frontendPort').value.trim();
  const color = document.getElementById('projectColor').value;
  const type = document.getElementById('projectType').value;

  const pathExists = await window.electronAPI.checkPathExists(path);
  if (!pathExists) {
    showToast('Path does not exist. Check the path and try again.', 'error', 5000);
    return;
  }

  if (editingProjectId) {
    const project = projects.find(p => p.id === editingProjectId);
    if (project) {
      Object.assign(project, { name, path, backendCommand, backendPort, frontendCommand, frontendPort, color, type });
    }
  } else {
    projects.push({
      id: Date.now().toString(),
      name, path, backendCommand, backendPort, frontendCommand, frontendPort, color, type,
      backendRunning: false, frontendRunning: false
    });
  }

  saveProjects();
  renderProjects();
  closeModal();
  projectForm.reset();
});

// Process event listeners
window.electronAPI.onProcessOutput((data) => {
  const consoleDiv = document.getElementById(`console-${data.id}`);
  if (consoleDiv) {
    appendConsole(consoleDiv, data.output.trim(), data.type);
  }
});

window.electronAPI.onProcessStopped((data) => {
  const consoleDiv = document.getElementById(`console-${data.id}`);
  if (consoleDiv) appendConsole(consoleDiv, `Process exited with code ${data.code}`, 'status');

  const dashIdx = data.id.indexOf('-');
  const projectId = data.id.slice(0, dashIdx);
  const type = data.id.slice(dashIdx + 1);
  const project = findProject(projectId);
  if (project) {
    if (type === 'backend') { project.backendRunning = false; project.backendPid = null; }
    else if (type === 'frontend') { project.frontendRunning = false; project.frontendPid = null; }
    saveProjects();
    renderProjects();
  }
});

window.electronAPI.onProcessError((data) => {
  const consoleDiv = document.getElementById(`console-${data.id}`);
  if (consoleDiv) appendConsole(consoleDiv, `Error: ${data.error}`, 'status error');

  const dashIdx = data.id.indexOf('-');
  const projectId = data.id.slice(0, dashIdx);
  const type = data.id.slice(dashIdx + 1);
  const project = findProject(projectId);
  if (project) {
    if (type === 'backend') { project.backendRunning = false; project.backendPid = null; }
    else if (type === 'frontend') { project.frontendRunning = false; project.frontendPid = null; }
    saveProjects();
    renderProjects();
  }
});

// Deep scan progress listener
window.electronAPI.onDeepScanProgress((data) => {
  const project = findProject(data.projectId);
  if (!project) return;
  project.scanProgress = data;
  const card = document.querySelector(`[data-project-id="${data.projectId}"]`);
  if (card) {
    const indicator = card.querySelector('.ai-scanning-indicator');
    if (indicator) {
      let detailText = data.detail || '';
      if (data.phase === 'phase2' && data.totalPages) {
        const idx = (data.pageIndex || 0) + 1;
        detailText = `${data.detail} (${idx}/${data.totalPages})`;
      }
      indicator.innerHTML = `${project.currentScanType || 'Scanning'} — <span class="ai-scanning-phase">${escapeHtml(detailText)}</span>`;
    }
  }
});

// Search and filter
searchInput.addEventListener('input', renderProjects);
statusFilter.addEventListener('change', renderProjects);

// Initialize
(async () => {
  await initErgonProject();
  await loadProjects();
  const scanCheck = await window.electronAPI.aiCheckScanDue();
  scanMeta.lastWeeklyScanAt = scanCheck.lastScanAt;
  scanMeta.scanBadgeVisible = false;
  updateScanBadge();
  setInterval(refreshAllStatuses, 5000);
  setTimeout(() => runWeeklyScanIfDue(), 2000);
})();
