function renderProjects() {
  const searchTerm = searchInput.value.toLowerCase();
  const statusFilterValue = statusFilter.value;

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm) ||
                         project.path.toLowerCase().includes(searchTerm);
    const isRunning = project.backendRunning || project.frontendRunning;
    const matchesStatus = !statusFilterValue ||
                         (statusFilterValue === 'running' && isRunning) ||
                         (statusFilterValue === 'stopped' && !isRunning);
    return matchesSearch && matchesStatus;
  });

  projectsGrid.innerHTML = '';

  if (ergonProject) {
    projectsGrid.appendChild(createErgonCard());
  }

  if (filteredProjects.length === 0 && !ergonProject) {
    emptyState.classList.add('show');
    projectsGrid.style.display = 'none';
  } else {
    emptyState.classList.remove('show');
    projectsGrid.style.display = 'grid';
    filteredProjects.forEach(project => {
      projectsGrid.appendChild(createProjectCard(project));
    });
  }
}

function renderProcessSection(project, type) {
  const isBackend = type === 'backend';
  const command = isBackend ? project.backendCommand : project.frontendCommand;
  if (!command) return '';

  const port = isBackend ? project.backendPort : project.frontendPort;
  const running = isBackend ? project.backendRunning : project.frontendRunning;
  const id = escapeHtml(project.id);
  const projectType = project.type || 'web';
  const isDesktop = projectType === 'desktop';

  let label;
  if (isDesktop) {
    label = '⚙️ Process';
  } else if (projectType === 'web') {
    label = '🌐 Dev Server';
  } else {
    label = isBackend ? '🔧 Backend' : '🎨 Frontend';
  }

  const urlStr = `http://localhost:${escapeHtml(port)}`;
  const showUrl = !isDesktop && port;

  return `
    <div class="process-section">
      <div class="process-header">
        <span class="process-title">${label}</span>
        <div class="process-controls">
          ${running
            ? `<button class="btn btn-danger"
                       onclick="stopProcess('${id}', '${type}')"
                       oncontextmenu="handleStopContextMenu(event, '${id}', '${type}')"
                       title="Stop (right-click to force stop)">Stop</button>`
            : `<button class="btn btn-success" onclick="startProcess('${id}', '${type}')">Start</button>`
          }
          ${showUrl ? `<button class="btn btn-info" onclick="openURL('${urlStr}')">Open</button>` : ''}
        </div>
      </div>
      <div class="command-display">${escapeHtml(command)}</div>
      ${showUrl ? `
        <div class="url-display-row">
          <div class="url-display">🌐 ${urlStr}</div>
          <button class="btn-copy-url" onclick="copyToClipboard('${urlStr}')" title="Copy URL">📋</button>
        </div>` : ''}
      <div class="port-conflict-warning" id="port-warning-${id}-${type}"></div>
      <div class="console-output" id="console-${id}-${type}"></div>
    </div>
  `;
}

function createErgonCard() {
  if (!ergonProject) return document.createElement('div');

  const project = ergonProject;
  const card = document.createElement('div');
  card.className = 'project-card ergon-card';
  card.dataset.projectId = ERGON_ID;

  const running = project.backendRunning;
  const statusText = running ? 'Running' : 'Stopped';
  const pid = escapeHtml(project.id);

  card.innerHTML = `
    <div class="ergon-card-bg"></div>
    <div class="ergon-card-content">
      <div class="project-header">
        <div style="flex:1;min-width:0">
          <div class="ergon-title-row">
            <span class="ergon-logo">🚀</span>
            <div>
              <div class="project-title">${escapeHtml(project.name)}</div>
              <div class="ergon-subtitle">Self-hosted project manager</div>
            </div>
          </div>
          <div class="project-path" onclick="openProjectFolder('${pid}')">
            📁 ${escapeHtml(project.path)}
          </div>
          <div class="project-meta">
            <div class="status-indicator ${running ? 'status-running' : 'status-stopped'}">
              <span class="status-dot"></span>
              ${statusText}
            </div>
            ${project.lastActive ? `<span class="project-last-active">Active ${timeAgo(project.lastActive)}</span>` : ''}
          </div>
        </div>
        <div class="project-actions">
          <span class="ergon-badge">Self</span>
        </div>
      </div>
      ${renderProcessSection(project, 'backend')}

      <div class="ai-section">
        <div class="ai-header">
          <span class="section-title">🤖 AI Scan</span>
          <div class="ai-controls">
            ${project.scanning
              ? `<span class="ai-scanning-indicator">Scanning <span class="ai-scanning-type">${escapeHtml(project.currentScanType || '')}</span>...</span>`
              : `<div class="ai-scan-btn-grid">
                  ${Object.values(SCAN_TYPES).map(st =>
                    `<button class="btn-ai-scan-type btn-ai-scan-${st.cssClass}"
                             onclick="scanSingleProject('${pid}', '${st.id}')"
                             title="${st.label}">${st.icon} ${st.label}</button>`
                  ).join('')}
                </div>`
            }
          </div>
        </div>
        ${project.scanResults
          ? renderScanPreview(project)
          : '<div class="ai-placeholder">No scan data yet. Run a scan below.</div>'
        }
      </div>
    </div>
  `;

  return card;
}

function createProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.projectId = project.id;
  card.style.setProperty('--project-color', project.color || '#3b82f6');

  const runningProcesses = [];
  if (project.backendRunning) runningProcesses.push('Backend');
  if (project.frontendRunning) runningProcesses.push('Frontend');
  const statusText = runningProcesses.length > 0
    ? runningProcesses.join(' & ') + ' Running'
    : 'Stopped';

  const pid = escapeHtml(project.id);

  card.innerHTML = `
    <div class="project-header">
      <div style="flex:1;min-width:0">
        <div class="project-title">${escapeHtml(project.name)}</div>
        <div class="project-note-wrap">
          <input type="text"
                 class="project-note-input"
                 placeholder="Add a quick note..."
                 value="${escapeHtml(project.note || '')}"
                 onblur="saveProjectNote('${pid}', this.value)"
                 onkeydown="if(event.key==='Enter'||event.key==='Escape')this.blur()">
        </div>
        <div class="project-path" onclick="openProjectFolder('${pid}')">
          📁 ${escapeHtml(project.path)}
        </div>
        <div class="project-meta">
          <div class="status-indicator ${runningProcesses.length > 0 ? 'status-running' : 'status-stopped'}">
            <span class="status-dot"></span>
            ${statusText}
          </div>
          ${project.lastActive ? `<span class="project-last-active">Active ${timeAgo(project.lastActive)}</span>` : ''}
        </div>
      </div>
      <div class="project-actions">
        <button class="btn-icon" onclick="editProject('${pid}')" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteProject('${pid}')" title="Delete">🗑️</button>
      </div>
    </div>

    ${project.hasGit ? `
    <div class="git-section">
      <div class="git-header">
        <span class="section-title">🔄 Git</span>
        <div class="git-controls">
          <button class="btn-git" onclick="gitCommit('${pid}')" title="Commit staged changes">Commit</button>
          <button class="btn-git" onclick="gitPush('${pid}')" title="Push to remote">Push</button>
          <button class="btn-git" onclick="gitPull('${pid}')" title="Pull from remote">Pull</button>
        </div>
      </div>
      <div class="git-output" id="git-output-${pid}"></div>
    </div>` : ''}

    <div class="ai-section">
      <div class="ai-header">
        <span class="section-title">🤖 AI Scan</span>
        <div class="ai-controls">
          ${project.scanning
            ? `<span class="ai-scanning-indicator">Scanning <span class="ai-scanning-type">${escapeHtml(project.currentScanType || '')}</span>...</span>`
            : `<div class="ai-scan-btn-grid">
                ${Object.values(SCAN_TYPES).map(st =>
                  `<button class="btn-ai-scan-type btn-ai-scan-${st.cssClass}"
                           onclick="scanSingleProject('${pid}', '${st.id}')"
                           title="${st.label}">${st.icon} ${st.label}</button>`
                ).join('')}
              </div>`
          }
        </div>
      </div>
      ${project.scanResults
        ? renderScanPreview(project)
        : '<div class="ai-placeholder">No scan data yet. Run a scan below.</div>'
      }
    </div>

    ${renderProcessSection(project, 'backend')}

    ${renderProcessSection(project, 'frontend')}
  `;

  return card;
}
