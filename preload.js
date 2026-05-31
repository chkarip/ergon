const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  startProcess: (data) => ipcRenderer.invoke('start-process', data),
  stopProcess: (id) => ipcRenderer.invoke('stop-process', id),
  checkProcessStatus: (pid) => ipcRenderer.invoke('check-process-status', pid),
  forceStopProcess: (pid) => ipcRenderer.invoke('force-stop-process', pid),
  checkPathExists: (path) => ipcRenderer.invoke('check-path-exists', path),
  checkPort: (port) => ipcRenderer.invoke('check-port', port),
  findFreePort: (startPort) => ipcRenderer.invoke('find-free-port', startPort),

  // Project storage
  saveProjects: (projects) => ipcRenderer.invoke('save-projects', projects),
  loadProjects: () => ipcRenderer.invoke('load-projects'),
  
  // Git Integration
  gitStatus: (projectPath) => ipcRenderer.invoke('git-status', projectPath),
  gitCommit: (data) => ipcRenderer.invoke('git-commit', data),
  gitPush: (projectPath) => ipcRenderer.invoke('git-push', projectPath),
  gitPull: (projectPath) => ipcRenderer.invoke('git-pull', projectPath),
  gitDiff: (projectPath) => ipcRenderer.invoke('git-diff', projectPath),
  checkGitRepo: (projectPath) => ipcRenderer.invoke('check-git-repo', projectPath),

  // App info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // Astro integration
  writeHandoff: (data) => ipcRenderer.invoke('write-handoff', data),
  launchAstrolabe: (astroProjectPath) => ipcRenderer.invoke('launch-astrolabe', astroProjectPath),

  // AI Scan
  aiScanProject: (projectPath, scanType) => ipcRenderer.invoke('ai-scan-project', projectPath, scanType),

  // Deep Scan (3-phase)
  deepScanProject: (projectPath, scanType, options) => ipcRenderer.invoke('deep-scan-project', projectPath, scanType, options),
  onDeepScanProgress: (callback) => {
    ipcRenderer.on('deep-scan-progress', (event, data) => callback(data));
  },
  
  onProcessOutput: (callback) => {
    ipcRenderer.on('process-output', (event, data) => callback(data));
  },
  onProcessStopped: (callback) => {
    ipcRenderer.on('process-stopped', (event, data) => callback(data));
  },
  onProcessError: (callback) => {
    ipcRenderer.on('process-error', (event, data) => callback(data));
  }
});
