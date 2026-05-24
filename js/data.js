async function loadProjects() {
  const result = await window.electronAPI.loadProjects();
  projects = result.projects || [];

  for (const project of projects) {
    project.scanning = false;
    window.electronAPI.checkGitRepo(project.path).then(r => {
      if (project.hasGit !== r.hasGit) {
        project.hasGit = r.hasGit;
        renderProjects();
      }
    });
    if (project.scanResults && Array.isArray(project.scanResults.bugs)) {
      const old = project.scanResults;
      project.scanResults = {};
      if (old.bugs && old.bugs.length > 0) {
        project.scanResults.bugs = { findings: old.bugs, scannedAt: old.scannedAt || Date.now() };
      }
      if (old.features && old.features.length > 0) {
        project.scanResults.features = { findings: old.features, scannedAt: old.scannedAt || Date.now() };
      }
    }
    if (!Array.isArray(project.savedSuggestions)) project.savedSuggestions = [];
    if (project.backendRunning && project.backendPid) {
      const status = await window.electronAPI.checkProcessStatus(project.backendPid);
      if (!status.isRunning) {
        project.backendRunning = false;
        project.backendPid = null;
      }
    }
    if (project.frontendRunning && project.frontendPid) {
      const status = await window.electronAPI.checkProcessStatus(project.frontendPid);
      if (!status.isRunning) {
        project.frontendRunning = false;
        project.frontendPid = null;
      }
    }
  }

  saveProjects();
  renderProjects();
}

async function saveProjects() {
  const result = await window.electronAPI.saveProjects(projects);
  if (!result.success) {
    console.error('Failed to save projects:', result.error);
  }
}

function editProject(projectId) {
  if (projectId === ERGON_ID) return;
  const project = findProject(projectId);
  if (!project) return;

  editingProjectId = projectId;
  modalTitle.textContent = 'Edit Project';

  document.getElementById('projectName').value = project.name;
  document.getElementById('projectPath').value = project.path;
  document.getElementById('projectType').value = project.type || 'web';
  document.getElementById('backendCommand').value = project.backendCommand || '';
  document.getElementById('backendPort').value = project.backendPort || '';
  document.getElementById('frontendCommand').value = project.frontendCommand || '';
  document.getElementById('frontendPort').value = project.frontendPort || '';
  document.getElementById('projectColor').value = project.color || '#3b82f6';

  projectModal.classList.add('show');
}

function deleteProject(projectId) {
  if (projectId === ERGON_ID) return;
  const project = findProject(projectId);
  if (!project) return;

  if (confirm(`Delete "${project.name}"?`)) {
    if (project.backendRunning) stopProcess(projectId, 'backend');
    if (project.frontendRunning) stopProcess(projectId, 'frontend');
    projects = projects.filter(p => p.id !== projectId);
    saveProjects();
    renderProjects();
  }
}

function saveProjectNote(projectId, value) {
  const project = findProject(projectId);
  if (!project) return;
  const trimmed = value.trim();
  if (project.note !== trimmed) {
    project.note = trimmed;
    saveProjects();
  }
}

async function openProjectFolder(projectId) {
  const project = findProject(projectId);
  if (project) {
    const result = await window.electronAPI.openFolder(project.path);
    if (!result.success) {
      showToast('Failed to open folder: ' + result.error, 'error');
    }
  }
}

function closeModal() {
  projectModal.classList.remove('show');
}

async function suggestPort(fieldId, otherFieldId) {
  const otherPort = otherFieldId ? parseInt(document.getElementById(otherFieldId).value) : null;
  const startFrom = otherPort ? Math.max(otherPort + 1, 1024) : 3000;
  const result = await window.electronAPI.findFreePort(startFrom);
  if (result.port) {
    document.getElementById(fieldId).value = result.port;
  }
}

async function initErgonProject() {
  try {
    const result = await window.electronAPI.getAppPath();
    ergonProject = {
      id: ERGON_ID,
      name: 'Ergon',
      path: result.path || '',
      type: 'web',
      backendCommand: 'npm run dev',
      backendPort: null,
      frontendCommand: null,
      frontendPort: null,
      color: '#667eea',
      note: '',
      backendRunning: false,
      backendPid: null,
      frontendRunning: false,
      frontendPid: null,
      lastActive: null,
      scanResults: null,
      scanning: false
    };
  } catch (e) {
    ergonProject = null;
  }
}
