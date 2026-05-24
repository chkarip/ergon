function renderScanPreview(project) {
  const r = project.scanResults;
  if (!r) return '<div class="ai-placeholder">No scan data yet. Run a scan below.</div>';

  const typeOrder = ['bugs', 'security', 'features', 'performance'];
  const haveAny = typeOrder.some(t => r[t] && r[t].findings && r[t].findings.length > 0);
  if (!haveAny) return '<div class="ai-placeholder">No findings in scan data.</div>';

  const latestTime = Math.max(
    ...typeOrder.filter(t => r[t] && r[t].scannedAt).map(t => r[t].scannedAt),
    0
  );

  return `
    <div class="ai-preview" onclick="openAIResultsModal('${escapeHtml(project.id)}')">
      ${typeOrder.map(t => {
        const st = SCAN_TYPES[t];
        const count = (r[t] && r[t].findings) ? r[t].findings.length : 0;
        return count > 0
          ? `<span class="ai-preview-stat ai-preview-${st.cssClass}">${st.icon} ${count}</span>`
          : '';
      }).join('')}
      <span class="ai-preview-time">Scanned ${timeAgo(latestTime)}</span>
    </div>`;
}

function renderFindingCard(item, type, screenshotMap, projectId, findingIndex) {
  const severityColors = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
  const usesSeverity = type !== 'features';
  const badgeLabel = usesSeverity ? item.severity : item.priority;
  const badgeColor = severityColors[badgeLabel] || '#6b7280';

  let thumbnailHtml = '';
  if (item.screen && screenshotMap) {
    const screenshotPath = screenshotMap[item.screen];
    if (screenshotPath) {
      const encoded = encodeURIComponent(screenshotPath);
      thumbnailHtml = `
        <div class="ai-finding-thumb" onclick="event.stopPropagation();viewScreenshot('${encoded}')" title="Screenshot of ${escapeHtml(item.screen)}">
          <img src="file://${encoded}" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.ai-finding-thumb-fallback').style.display='flex'">
          <div class="ai-finding-thumb-fallback" style="display:none">🖼️</div>
        </div>`;
    }
  }

  let actionBtns = '';
  if (projectId && findingIndex !== undefined) {
    const project = findProject(projectId);
    const saved = project && Array.isArray(project.savedSuggestions)
      ? project.savedSuggestions.find(s => s.type === type && s.item.title === item.title)
      : null;
    const copyCall = `copyFinding('${escapeHtml(projectId)}','${escapeHtml(type)}',${findingIndex})`;
    const dismissCall = `dismissFinding('${escapeHtml(projectId)}','${escapeHtml(type)}',${findingIndex})`;
    if (saved) {
      actionBtns = `
        <button class="ai-action-btn ai-copy-btn" title="Copy to clipboard" onclick="event.stopPropagation();${copyCall}">📋</button>
        <button class="ai-action-btn ai-done-btn" title="Mark done" onclick="event.stopPropagation();markSuggestionDone('${escapeHtml(projectId)}','${escapeHtml(saved.id)}')">✓</button>
        <button class="ai-action-btn ai-save-btn ai-save-btn--saved" title="Unsave" onclick="event.stopPropagation();unsaveSuggestion('${escapeHtml(projectId)}','${escapeHtml(saved.id)}')">🔖</button>`;
    } else {
      actionBtns = `
        <button class="ai-action-btn ai-copy-btn" title="Copy to clipboard" onclick="event.stopPropagation();${copyCall}">📋</button>
        <button class="ai-action-btn ai-save-btn" title="Save suggestion" onclick="event.stopPropagation();saveSuggestion('${escapeHtml(projectId)}','${escapeHtml(type)}',${findingIndex})">🔖</button>
        <button class="ai-action-btn ai-dismiss-btn" title="Dismiss" onclick="event.stopPropagation();${dismissCall}">✕</button>`;
    }
  }

  return `
    <div class="ai-finding-card">
      <div class="ai-finding-header">
        <span class="ai-finding-badge" style="background:${badgeColor}">${escapeHtml(badgeLabel)}</span>
        <span class="ai-finding-title">${escapeHtml(item.title)}</span>
        <div class="ai-finding-actions">${actionBtns}</div>
      </div>
      <div class="ai-finding-desc">${escapeHtml(item.description)}</div>
      <div class="ai-finding-refs">
        ${item.file ? `<div class="ai-finding-file">📄 ${escapeHtml(item.file)}</div>` : ''}
        ${item.screen ? `<div class="ai-finding-screen">🖥️ ${escapeHtml(item.screen)}</div>` : ''}
      </div>
      ${thumbnailHtml}
    </div>`;
}

function renderSavedCard(saved, projectId) {
  const item = saved.item;
  const severityColors = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
  const usesSeverity = saved.type !== 'features';
  const badgeLabel = usesSeverity ? item.severity : item.priority;
  const badgeColor = severityColors[badgeLabel] || '#6b7280';
  const copyCall = `copyFindingText(\`${escapeHtml(item.title)}\`,\`${escapeHtml(item.description)}\`,\`${escapeHtml(item.file || '')}\`,\`${escapeHtml(item.screen || '')}\`)`;
  return `
    <div class="ai-finding-card ai-finding-card--saved">
      <div class="ai-finding-header">
        <span class="ai-finding-badge" style="background:${badgeColor}">${escapeHtml(badgeLabel)}</span>
        <span class="ai-finding-title">${escapeHtml(item.title)}</span>
        <div class="ai-finding-actions">
          <button class="ai-action-btn ai-copy-btn" title="Copy to clipboard" onclick="event.stopPropagation();${copyCall}">📋</button>
          <button class="ai-action-btn ai-done-btn" title="Mark done" onclick="event.stopPropagation();markSuggestionDone('${escapeHtml(projectId)}','${escapeHtml(saved.id)}')">✓</button>
          <button class="ai-action-btn ai-save-btn ai-save-btn--saved" title="Unsave" onclick="event.stopPropagation();unsaveSuggestion('${escapeHtml(projectId)}','${escapeHtml(saved.id)}')">🔖</button>
        </div>
      </div>
      <div class="ai-finding-desc">${escapeHtml(item.description)}</div>
      <div class="ai-finding-refs">
        ${item.file ? `<div class="ai-finding-file">📄 ${escapeHtml(item.file)}</div>` : ''}
        ${item.screen ? `<div class="ai-finding-screen">🖥️ ${escapeHtml(item.screen)}</div>` : ''}
      </div>
    </div>`;
}

function renderAIResultsModal(focusProjectId, filterScanType) {
  const body = document.getElementById('aiModalBody');
  const typeOrder = ['bugs', 'security', 'features', 'performance'];

  const typesToCheck = filterScanType ? [filterScanType] : typeOrder;

  let allProjects = ergonProject ? [ergonProject, ...projects] : projects;
  let projectsWithResults = allProjects.filter(p => {
    const hasScan = p.scanResults && typesToCheck.some(t => p.scanResults[t] && p.scanResults[t].findings && p.scanResults[t].findings.length > 0);
    const hasSaved = Array.isArray(p.savedSuggestions) && p.savedSuggestions.some(s => !filterScanType || s.type === filterScanType);
    return hasScan || hasSaved;
  });

  if (focusProjectId) {
    projectsWithResults = projectsWithResults.filter(p => p.id === focusProjectId);
  }

  if (projectsWithResults.length === 0) {
    const label = filterScanType ? (SCAN_TYPES[filterScanType] || {}).label || 'this scan type' : '';
    body.innerHTML = `<div class="ai-empty">No ${label} results yet. Click a scan button on a project card to analyze it.</div>`;
    return;
  }

  body.innerHTML = projectsWithResults
    .sort((a, b) => {
      const aMax = Math.max(...typesToCheck.map(t => (a.scanResults && a.scanResults[t] && a.scanResults[t].scannedAt) || 0));
      const bMax = Math.max(...typesToCheck.map(t => (b.scanResults && b.scanResults[t] && b.scanResults[t].scannedAt) || 0));
      return bMax - aMax;
    })
    .map(p => {
      const r = p.scanResults || {};
      const latestTime = Math.max(...typesToCheck.map(t => (r[t] && r[t].scannedAt) || 0), 0);

      const savedForTypes = (p.savedSuggestions || []).filter(s => !filterScanType || s.type === filterScanType);
      const savedSectionHtml = savedForTypes.length > 0 ? `
        <div class="ai-saved-section">
          <div class="ai-saved-section-header">🔖 Saved (${savedForTypes.length})</div>
          ${savedForTypes.map(s => {
            const st = SCAN_TYPES[s.type] || {};
            return `
              <div class="ai-saved-type-label">${st.icon || ''} ${st.label || s.type}</div>
              ${renderSavedCard(s, p.id)}
            `;
          }).join('')}
        </div>` : '';

      const hasUnSavedFindings = typesToCheck.some(t => {
        if (!r[t] || !r[t].findings || r[t].findings.length === 0) return false;
        const savedSet = new Set(
          (p.savedSuggestions || []).filter(s => s.type === t).map(s => s.item.title)
        );
        return r[t].findings.some(item => !savedSet.has(item.title));
      });

      return `
        <div class="ai-project-section" style="--project-color: ${escapeHtml(p.color || '#3b82f6')}">
          <div class="ai-project-header">
            <h3>${escapeHtml(p.name)}</h3>
            ${latestTime > 0 ? `<span class="ai-scan-time">Scanned ${timeAgo(latestTime)}</span>` : ''}
          </div>
          ${savedSectionHtml}
          <div class="ai-findings">
            ${typesToCheck.map(type => {
              const result = r[type];
              if (!result || !result.findings || result.findings.length === 0) return '';
              const savedSet = new Set(
                (p.savedSuggestions || [])
                  .filter(s => s.type === type)
                  .map(s => s.item.title)
              );
              const unsavedFindings = result.findings.filter(item => !savedSet.has(item.title));
              if (unsavedFindings.length === 0) return '';
              const st = SCAN_TYPES[type];
              const ssMap = {};
              if (result.pageCaptures) {
                for (const cap of result.pageCaptures) {
                  if (cap.screenshotPath) ssMap[cap.url] = cap.screenshotPath;
                }
              }
              return `
                <h4 class="ai-subheading ai-${st.cssClass}-heading">${st.icon} ${st.label} (${unsavedFindings.length})</h4>
                ${unsavedFindings.map((item) => {
                  const idx = result.findings.indexOf(item);
                  return renderFindingCard(item, type, ssMap, p.id, idx);
                }).join('')}
              `;
            }).join('')}
            ${!hasUnSavedFindings && savedForTypes.length === 0
              ? '<div class="ai-empty">No findings for this project.</div>' : ''}
          </div>
          ${(() => {
            const seen = new Set();
            let gallery = '';
            for (const t of typesToCheck) {
              const rt = r[t];
              if (!rt || !rt.pageCaptures || rt.pageCaptures.length === 0) continue;
              for (const cap of rt.pageCaptures) {
                if (seen.has(cap.url)) continue;
                seen.add(cap.url);
                const encodedPath = encodeURIComponent(cap.screenshotPath);
                gallery += `
                  <div class="ai-screenshot-thumb" onclick="viewScreenshot('${encodedPath}')" title="${escapeHtml(cap.url)}">
                    <img src="file://${encodedPath}" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.ai-screenshot-fallback').style.display='flex'">
                    <div class="ai-screenshot-fallback" style="display:none">🖼️</div>
                    <span class="ai-screenshot-label">${escapeHtml(cap.url)}</span>
                  </div>`;
              }
            }
            return gallery ? `<div class="ai-screenshot-section"><h4 class="ai-subheading">📸 Page Screenshots</h4><div class="ai-screenshot-gallery">${gallery}</div></div>` : '';
          })()}
          ${filterScanType ? `
            <div class="ai-find-more-wrap">
              <button class="btn-ai-find-more" onclick="findMore('${escapeHtml(p.id)}','${escapeHtml(filterScanType)}')">🔍 Find More ${SCAN_TYPES[filterScanType] ? SCAN_TYPES[filterScanType].label : ''}</button>
            </div>` : ''}
        </div>`;
    }).join('');
}

function openAIResultsModal(focusProjectId, filterScanType) {
  if (!focusProjectId && !filterScanType && scanMeta.scanBadgeVisible) {
    scanMeta.scanBadgeVisible = false;
    window.electronAPI.aiMarkScanComplete({
      lastScanAt: scanMeta.lastWeeklyScanAt,
      badgeVisible: false
    });
  }
  _currentModalFocusId = focusProjectId || null;
  _currentModalFilterType = filterScanType || null;
  renderAIResultsModal(_currentModalFocusId, _currentModalFilterType);
  document.getElementById('aiResultsModal').classList.add('show');
  updateScanBadge();
}

function closeAIResultsModal() {
  document.getElementById('aiResultsModal').classList.remove('show');
}

function updateScanBadge() {
  const badge = document.getElementById('aiScanBadge');
  const typeOrder = ['bugs', 'security', 'features', 'performance'];
  const hasResults = projects.some(p =>
    p.scanResults && typeOrder.some(t =>
      p.scanResults[t] && p.scanResults[t].findings && p.scanResults[t].findings.length > 0
    )
  );
  badge.style.display = hasResults ? 'inline-flex' : 'none';
  const dot = badge.querySelector('.ai-badge-dot');
  if (dot) {
    dot.className = scanMeta.scanBadgeVisible ? 'ai-badge-dot ai-badge-new' : 'ai-badge-dot';
  }
}

function viewScreenshot(screenshotPath) {
  const decoded = decodeURIComponent(screenshotPath);
  const overlay = document.getElementById('screenshotOverlay');
  const img = document.getElementById('screenshotOverlayImg');
  img.src = `file://${decoded}`;
  overlay.classList.add('show');
}

function closeScreenshotViewer() {
  const overlay = document.getElementById('screenshotOverlay');
  overlay.classList.remove('show');
  document.getElementById('screenshotOverlayImg').src = '';
}
