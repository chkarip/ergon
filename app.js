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
    const linkModal = document.getElementById('astroLinkModal');
    if (linkModal && linkModal.classList.contains('show')) {
      closeAstroLinkModal();
    } else {
      const aiModal = document.getElementById('aiResultsModal');
      if (aiModal && aiModal.classList.contains('show')) {
        closeAIResultsModal();
      } else {
        closeModal();
      }
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

async function openInAstrolabe(projectId) {
  const project = findProject(projectId);
  if (!project) return;

  // Find the Astrolabe project registered in Ergon to get its path
  const astroEntry = projects.find(p =>
    p.name.toLowerCase().includes('astro') ||
    p.path.toLowerCase().includes('astrolabe')
  );
  if (!astroEntry) {
    showToast('Add your Astrolabe project to Ergon first.', 'error', 5000);
    return;
  }

  // Write handoff: linked workspace opens directly; no link signals create-new
  const handoff = { name: project.name, path: project.path };
  if (project.astroLinkedProject) {
    handoff.astroProject = project.astroLinkedProject;
  } else {
    handoff.createNew = true;
  }
  await window.electronAPI.writeHandoff(handoff);

  // Try the dev binary first (debug/release build in src-tauri/target/).
  // Fall back to the astrolabe:// protocol only if no binary is found (installed build).
  const bin = await window.electronAPI.launchAstrolabe(astroEntry.path);
  if (!bin.success) {
    const proto = await window.electronAPI.openUrl('astrolabe://');
    if (!proto.success) {
      showToast('Could not launch Astrolabe: ' + bin.error, 'error', 6000);
      return;
    }
  }

  const msg = project.astroLinkedProject
    ? `Opening "${project.astroLinkedProject}" in Astrolabe ✓`
    : 'Astrolabe opening — create new workspace ✓';
  showToast(msg, 'success', 2500);
}

// --- Astrolabe Link Modal ---

let _astroLinkProjectId = null;

function openLinkAstrolabe(projectId) {
  const project = findProject(projectId);
  if (!project) return;

  _astroLinkProjectId = projectId;
  document.getElementById('astroLinkProjectName').textContent = project.name;
  document.getElementById('astroLinkInput').value = project.astroLinkedProject || '';

  const clearBtn = document.getElementById('astroLinkClearBtn');
  const currentDiv = document.getElementById('astroLinkCurrent');
  if (project.astroLinkedProject) {
    clearBtn.style.display = '';
    currentDiv.textContent = `Currently linked to: ${project.astroLinkedProject}`;
    currentDiv.style.display = '';
  } else {
    clearBtn.style.display = 'none';
    currentDiv.style.display = 'none';
  }

  const modal = document.getElementById('astroLinkModal');
  modal.style.display = 'flex';
  modal.classList.add('show');
  setTimeout(() => document.getElementById('astroLinkInput').focus(), 50);
}

function closeAstroLinkModal() {
  const modal = document.getElementById('astroLinkModal');
  modal.classList.remove('show');
  modal.style.display = 'none';
  _astroLinkProjectId = null;
}

function saveAstroLink() {
  if (!_astroLinkProjectId) return;
  const project = findProject(_astroLinkProjectId);
  if (!project) return;

  const name = document.getElementById('astroLinkInput').value.trim();
  if (!name) {
    showToast('Enter an Astrolabe project name to link.', 'error', 3000);
    return;
  }

  project.astroLinkedProject = name;
  saveProjects();
  renderProjects();
  closeAstroLinkModal();
  showToast(`Linked "${project.name}" → "${name}" in Astrolabe ✓`, 'success', 2500);
}

function clearAstroLink() {
  if (!_astroLinkProjectId) return;
  const project = findProject(_astroLinkProjectId);
  if (!project) return;

  delete project.astroLinkedProject;
  saveProjects();
  renderProjects();
  closeAstroLinkModal();
  showToast('Astrolabe link removed.', 'info', 2000);
}

document.getElementById('astroLinkCloseBtn').addEventListener('click', closeAstroLinkModal);
document.getElementById('astroLinkCancelBtn').addEventListener('click', closeAstroLinkModal);
document.getElementById('astroLinkSaveBtn').addEventListener('click', saveAstroLink);
document.getElementById('astroLinkClearBtn').addEventListener('click', clearAstroLink);
document.getElementById('astroLinkModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('astroLinkModal')) closeAstroLinkModal();
});
document.getElementById('astroLinkInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveAstroLink();
  if (e.key === 'Escape') closeAstroLinkModal();
});

// Initialize
(async () => {
  await initErgonProject();
  await loadProjects();
  updateScanBadge();
  setInterval(refreshAllStatuses, 5000);
})();
