// State Management
let projects = [];
let editingProjectId = null;
let scanMeta = { lastWeeklyScanAt: null, scanBadgeVisible: false };
const ERGON_ID = '__ergon__';
let ergonProject = null;

const SCAN_TYPES = {
  bugs:        { id: 'bugs',        icon: '🐛', label: 'Find Bugs',          cssClass: 'bugs' },
  security:    { id: 'security',    icon: '🔒', label: 'Check Security',     cssClass: 'security' },
  features:    { id: 'features',    icon: '💡', label: 'Generate Features',  cssClass: 'features' },
  performance: { id: 'performance', icon: '⚡', label: 'Improve Performance', cssClass: 'performance' }
};

let _currentModalFocusId = null;
let _currentModalFilterType = null;

function findProject(id) {
  if (id === ERGON_ID) return ergonProject;
  return projects.find(p => p.id === id);
}
