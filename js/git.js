function setGitOutput(projectId, content, type = 'info') {
  const outputDiv = document.getElementById(`git-output-${projectId}`);
  if (!outputDiv) return;
  outputDiv.textContent = content;
  outputDiv.className = `git-output git-output-${type} show`;
}

async function gitStatus(projectId) {
  const project = findProject(projectId);
  if (!project) return;

  const result = await window.electronAPI.gitStatus(project.path);
  if (result.success) {
    setGitOutput(projectId, result.status || 'Working directory clean', 'info');
  } else {
    setGitOutput(projectId, result.error, 'error');
    showToast('Git status failed', 'error');
  }
}

async function gitDiff(projectId) {
  const project = findProject(projectId);
  if (!project) return;

  const result = await window.electronAPI.gitDiff(project.path);
  if (result.success) {
    setGitOutput(projectId, result.diff || 'No changes to show', 'info');
  } else {
    setGitOutput(projectId, result.error, 'error');
    showToast('Git diff failed', 'error');
  }
}

function gitCommit(projectId) {
  const card = document.querySelector(`[data-project-id="${projectId}"]`);
  if (!card) return;

  const gitSection = card.querySelector('.git-section');
  if (gitSection.querySelector('.git-commit-form')) {
    gitSection.querySelector('.git-commit-input').focus();
    return;
  }

  const form = document.createElement('div');
  form.className = 'git-commit-form';
  form.innerHTML = `
    <input type="text" class="git-commit-input" placeholder="Commit message...">
    <button class="btn-commit-ok" title="Commit">✓</button>
    <button class="btn-commit-cancel" title="Cancel">✕</button>
  `;
  gitSection.appendChild(form);

  const input = form.querySelector('.git-commit-input');
  input.focus();

  const doCommit = async () => {
    const msg = input.value.trim();
    if (!msg) return;
    form.remove();
    await gitCommitWithMessage(projectId, msg);
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doCommit();
    else if (e.key === 'Escape') form.remove();
  });
  form.querySelector('.btn-commit-ok').addEventListener('click', doCommit);
  form.querySelector('.btn-commit-cancel').addEventListener('click', () => form.remove());
}

async function gitCommitWithMessage(projectId, message) {
  const project = findProject(projectId);
  if (!project) return;

  const result = await window.electronAPI.gitCommit({ projectPath: project.path, message });
  if (result.success) {
    showToast('Commit successful!', 'success');
    setGitOutput(projectId, result.output || 'Committed successfully', 'success');
  } else {
    showToast('Commit failed', 'error');
    setGitOutput(projectId, result.error, 'error');
  }
}

async function gitPush(projectId) {
  const project = findProject(projectId);
  if (!project) return;

  showToast('Pushing...', 'info', 1500);
  const result = await window.electronAPI.gitPush(project.path);
  if (result.success) {
    showToast('Push successful!', 'success');
    setGitOutput(projectId, result.output || 'Pushed successfully', 'success');
  } else {
    showToast('Push failed', 'error');
    setGitOutput(projectId, result.error, 'error');
  }
}

async function gitPull(projectId) {
  const project = findProject(projectId);
  if (!project) return;

  showToast('Pulling...', 'info', 1500);
  const result = await window.electronAPI.gitPull(project.path);
  if (result.success) {
    showToast('Pull successful!', 'success');
    setGitOutput(projectId, result.output || 'Up to date', 'success');
  } else {
    showToast('Pull failed', 'error');
    setGitOutput(projectId, result.error, 'error');
  }
}
