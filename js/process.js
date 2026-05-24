async function startProcess(projectId, type) {
  const project = findProject(projectId);
  if (!project) return;

  const command = type === 'backend' ? project.backendCommand : project.frontendCommand;
  const portStr = type === 'backend' ? project.backendPort : project.frontendPort;
  const port = (portStr && /^\d+$/.test(String(portStr))) ? parseInt(portStr, 10) : null;
  if (!command) return;

  const pathExists = await window.electronAPI.checkPathExists(project.path);
  if (!pathExists) {
    showToast('Project path does not exist: ' + project.path, 'error');
    return;
  }

  if (port && (project.type || 'web') !== 'desktop') {
    const portCheck = await window.electronAPI.checkPort(port);
    if (portCheck.inUse) {
      const freeResult = await window.electronAPI.findFreePort(port + 1);
      showPortConflictWarning(projectId, type, port, freeResult.port || null);
      return;
    }
  }

  const warningDiv = document.getElementById(`port-warning-${projectId}-${type}`);
  if (warningDiv) warningDiv.style.display = 'none';

  const processId = `${projectId}-${type}`;
  const consoleDiv = document.getElementById(`console-${processId}`);
  if (consoleDiv) {
    appendConsole(consoleDiv, `Starting ${type}: ${command}${port ? ` (port ${port})` : ''}`, 'status');
  }

  const result = await window.electronAPI.startProcess({ id: processId, command, cwd: project.path, port });

  if (result.success) {
    if (type === 'backend') {
      project.backendRunning = true;
      project.backendPid = result.pid;
    } else {
      project.frontendRunning = true;
      project.frontendPid = result.pid;
    }
    project.lastActive = Date.now();
    saveProjects();
    renderProjects();
    const newConsole = document.getElementById(`console-${processId}`);
    if (newConsole) appendConsole(newConsole, `Started (PID: ${result.pid})`, 'status success');
  } else {
    if (consoleDiv) appendConsole(consoleDiv, `Failed: ${result.error}`, 'status error');
    showToast(`Failed to start ${type}: ${result.error}`, 'error');
  }
}

async function checkProcessStatus(projectId, type) {
  const project = findProject(projectId);
  if (!project) return;

  const pid = type === 'backend' ? project.backendPid : project.frontendPid;
  if (!pid) {
    if (type === 'backend') project.backendRunning = false;
    else project.frontendRunning = false;
    saveProjects();
    renderProjects();
    return;
  }

  const result = await window.electronAPI.checkProcessStatus(pid);
  const isRunning = result.isRunning;

  if (type === 'backend') {
    project.backendRunning = isRunning;
    if (!isRunning) project.backendPid = null;
  } else {
    project.frontendRunning = isRunning;
    if (!isRunning) project.frontendPid = null;
  }

  saveProjects();
  renderProjects();

  const processId = `${projectId}-${type}`;
  const consoleDiv = document.getElementById(`console-${processId}`);
  if (consoleDiv) {
    appendConsole(consoleDiv,
      `${type} status: ${isRunning ? `Running (PID: ${pid})` : 'Not running'}`,
      isRunning ? 'status success' : 'status error');
  }
}

async function forceStopProcess(projectId, type) {
  const project = findProject(projectId);
  if (!project) return;

  const pid = type === 'backend' ? project.backendPid : project.frontendPid;
  if (!pid) {
    showToast(`No ${type} process found`, 'warning');
    return;
  }

  const processId = `${projectId}-${type}`;
  const consoleDiv = document.getElementById(`console-${processId}`);
  if (consoleDiv) appendConsole(consoleDiv, `Force stopping ${type} (PID: ${pid})...`, 'status');

  const result = await window.electronAPI.forceStopProcess(pid);
  if (result.success) {
    setTimeout(() => checkProcessStatus(projectId, type), 1000);
  } else {
    if (consoleDiv) appendConsole(consoleDiv, `Force stop failed: ${result.error}`, 'status error');
  }
}

async function stopProcess(projectId, type) {
  const project = findProject(projectId);
  if (!project) return;

  const processId = `${projectId}-${type}`;
  const consoleDiv = document.getElementById(`console-${processId}`);
  if (consoleDiv) appendConsole(consoleDiv, `Stopping ${type}...`, 'status');

  const result = await window.electronAPI.stopProcess(processId);

  if (result.success) {
    if (type === 'backend') {
      project.backendRunning = false;
      project.backendPid = null;
    } else {
      project.frontendRunning = false;
      project.frontendPid = null;
    }
    saveProjects();
    renderProjects();
    const newConsole = document.getElementById(`console-${processId}`);
    if (newConsole) appendConsole(newConsole, `${type} stopped`, 'status success');
  } else {
    if (consoleDiv) appendConsole(consoleDiv, `Stop failed: ${result.error}`, 'status error');
  }
}

function appendConsole(consoleDiv, text, cls = '') {
  const line = document.createElement('div');
  line.className = `console-line ${cls}`.trim();
  line.textContent = text;
  consoleDiv.appendChild(line);
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function handleStopContextMenu(e, projectId, type) {
  e.preventDefault();
  if (confirm(`Force stop ${type}? This will immediately kill the process.`)) {
    forceStopProcess(projectId, type);
  }
}

function openURL(url) {
  window.electronAPI.openUrl(url);
}

function showPortConflictWarning(projectId, type, usedPort, suggestedPort) {
  const warningDiv = document.getElementById(`port-warning-${projectId}-${type}`);
  if (!warningDiv) return;
  warningDiv.innerHTML = `
    <span class="port-warning-text">⚠️ Port ${usedPort} is in use.</span>
    ${suggestedPort
      ? `<span class="port-warning-suggest">Use ${suggestedPort} instead?</span>
         <button class="btn-port-use" onclick="updatePortAndStart('${escapeHtml(projectId)}', '${escapeHtml(type)}', ${suggestedPort})">Use ${suggestedPort}</button>`
      : '<span class="port-warning-suggest">No free port found nearby.</span>'
    }
  `;
  warningDiv.style.display = 'flex';
}

async function updatePortAndStart(projectId, type, newPort) {
  const project = findProject(projectId);
  if (!project) return;

  if (type === 'backend') project.backendPort = String(newPort);
  else project.frontendPort = String(newPort);

  await saveProjects();
  renderProjects();
  setTimeout(() => startProcess(projectId, type), 50);
}

async function refreshAllStatuses() {
  let changed = false;
  const allProjects = ergonProject ? [ergonProject, ...projects] : projects;
  for (const project of allProjects) {
    if (project.backendRunning && project.backendPid) {
      const s = await window.electronAPI.checkProcessStatus(project.backendPid);
      if (!s.isRunning) {
        project.backendRunning = false;
        project.backendPid = null;
        changed = true;
      }
    }
    if (project.frontendRunning && project.frontendPid) {
      const s = await window.electronAPI.checkProcessStatus(project.frontendPid);
      if (!s.isRunning) {
        project.frontendRunning = false;
        project.frontendPid = null;
        changed = true;
      }
    }
    updateStatusBadge(project);
  }
  if (changed) {
    saveProjects();
    renderProjects();
  }
}

function updateStatusBadge(project) {
  const card = document.querySelector(`[data-project-id="${project.id}"]`);
  if (!card) return;
  const indicator = card.querySelector('.status-indicator');
  if (!indicator) return;
  const running = [];
  if (project.backendRunning) running.push('Backend');
  if (project.frontendRunning) running.push('Frontend');
  const text = running.length > 0 ? running.join(' & ') + ' Running' : 'Stopped';
  indicator.className = `status-indicator ${running.length > 0 ? 'status-running' : 'status-stopped'}`;
  indicator.innerHTML = `<span class="status-dot"></span>${text}`;
}
