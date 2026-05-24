function copyFinding(projectId, type, findingIndex) {
  const project = findProject(projectId);
  if (!project) return;
  const item = project.scanResults && project.scanResults[type] && project.scanResults[type].findings
    ? project.scanResults[type].findings[findingIndex]
    : null;
  if (!item) return;
  copyFindingText(item.title, item.description, item.file || '', item.screen || '');
}

function copyFindingText(title, description, file, screen) {
  const parts = [];
  if (title) parts.push(title);
  if (description) parts.push(description);
  if (file) parts.push(`File: ${file}`);
  if (screen) parts.push(`Page: ${screen}`);
  const text = parts.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard', 'success', 2000);
  }).catch(() => {
    showToast('Failed to copy', 'error', 2000);
  });
}

function saveSuggestion(projectId, type, findingIndex) {
  const project = findProject(projectId);
  if (!project) return;
  const item = project.scanResults && project.scanResults[type] && project.scanResults[type].findings
    ? project.scanResults[type].findings[findingIndex]
    : null;
  if (!item) return;
  if (!Array.isArray(project.savedSuggestions)) project.savedSuggestions = [];
  if (project.savedSuggestions.some(s => s.type === type && s.item.title === item.title)) return;
  project.savedSuggestions.push({
    id: `saved_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    item,
    savedAt: Date.now()
  });
  saveProjects();
  renderAIResultsModal(_currentModalFocusId, _currentModalFilterType);
}

function unsaveSuggestion(projectId, savedId) {
  const project = findProject(projectId);
  if (!project || !Array.isArray(project.savedSuggestions)) return;
  project.savedSuggestions = project.savedSuggestions.filter(s => s.id !== savedId);
  saveProjects();
  renderAIResultsModal(_currentModalFocusId, _currentModalFilterType);
}

function markSuggestionDone(projectId, savedId) {
  const project = findProject(projectId);
  if (!project || !Array.isArray(project.savedSuggestions)) return;
  project.savedSuggestions = project.savedSuggestions.filter(s => s.id !== savedId);
  saveProjects();
  renderAIResultsModal(_currentModalFocusId, _currentModalFilterType);
  showToast('Marked as done', 'success', 2000);
}

function dismissFinding(projectId, type, findingIndex) {
  const project = findProject(projectId);
  if (!project || !project.scanResults || !project.scanResults[type]) return;
  const findings = project.scanResults[type].findings;
  if (!findings || findingIndex >= findings.length) return;
  findings.splice(findingIndex, 1);
  saveProjects();
  renderAIResultsModal(_currentModalFocusId, _currentModalFilterType);
  showToast('Dismissed', 'success', 2000);
}

function findMore(projectId, scanType) {
  const project = findProject(projectId);
  if (!project || project.scanning) return;
  closeAIResultsModal();
  scanSingleProject(projectId, scanType);
}

async function scanSingleProject(projectId, scanType) {
  const project = findProject(projectId);
  if (!project || project.scanning) return;

  const st = SCAN_TYPES[scanType] || SCAN_TYPES.bugs;
  project.scanning = true;
  project.currentScanType = st.label;
  project.scanProgress = { phase: 'phase1', detail: 'Starting deep scan...' };
  renderProjects();
  showToast(`Deep scanning ${project.name} — ${st.label}...`, 'info', 0);

  let command = null;
  let configPort = null;
  if (project.type === 'web') {
    command = project.backendCommand || null;
    configPort = project.backendPort ? parseInt(project.backendPort, 10) : null;
  } else if (project.type === 'fullstack') {
    command = project.frontendCommand || project.backendCommand || null;
    configPort = project.frontendPort ? parseInt(project.frontendPort, 10)
               : (project.backendPort ? parseInt(project.backendPort, 10) : null);
  }

  const result = await window.electronAPI.deepScanProject(project.path, scanType, {
    projectId,
    projectType: project.type || 'web',
    command,
    configPort
  });

  project.scanning = false;
  project.currentScanType = null;
  project.scanProgress = null;

  const toasts = document.querySelectorAll('.toast-info');
  toasts.forEach(t => t.remove());

  if (result.success) {
    if (!project.scanResults) project.scanResults = {};
    project.scanResults[scanType] = result.results;
    saveProjects();
    renderProjects();
    updateScanBadge();
    const count = (result.results.findings || []).length;
    const pageInfo = (result.results.pageCaptures && result.results.pageCaptures.length > 0)
      ? ` across ${result.results.pageCaptures.length} pages` : '';
    showToast(`Deep scan complete: ${count} finding${count !== 1 ? 's' : ''}${pageInfo}`, 'success');
    openAIResultsModal(projectId, scanType);
  } else {
    showToast(`Deep scan failed: ${result.error}`, 'error');
  }
}

async function runWeeklyScanIfDue() {
  const check = await window.electronAPI.aiCheckScanDue();
  if (!check.due) return;

  const scannableProjects = projects.filter(p => p.type !== 'desktop');
  if (scannableProjects.length === 0) return;

  showToast(`Weekly AI scan starting for ${scannableProjects.length} project(s)...`, 'info', 4000);

  const paths = scannableProjects.map(p => p.path);
  const result = await window.electronAPI.aiScanAll(paths);

  if (result.success) {
    for (const [projPath, scanResults] of Object.entries(result.results)) {
      const project = projects.find(p => p.path === projPath);
      if (project) {
        if (!project.scanResults) project.scanResults = {};
        if (scanResults.bugs && scanResults.bugs.findings && scanResults.bugs.findings.length > 0) {
          project.scanResults.bugs = scanResults.bugs;
        }
        if (scanResults.features && scanResults.features.findings && scanResults.features.findings.length > 0) {
          project.scanResults.features = scanResults.features;
        }
      }
    }
    await window.electronAPI.aiMarkScanComplete({
      lastScanAt: Date.now(),
      badgeVisible: true
    });
    scanMeta.lastWeeklyScanAt = Date.now();
    scanMeta.scanBadgeVisible = true;
    saveProjects();
    renderProjects();
    updateScanBadge();
    showToast('Weekly AI scan complete! Click 🤖 to see results.', 'success');
  } else {
    showToast('Weekly scan failed: ' + (result.error || 'unknown error'), 'error');
  }
}
