export const PROJECT_LIFECYCLE = Object.freeze([
  { status: 'project-created', label: 'Project Created' },
  { status: 'vendor-selected', label: 'Vendor Selected' },
  { status: 'quote-approved', label: 'Quote Approved' },
  { status: 'bulk-purchase-completed', label: 'Bulk Purchase Completed' },
  { status: 'materials-ready', label: 'Materials Ready' },
  { status: 'vendor-ready-for-installation', label: 'Vendor Ready for Installation' },
  { status: 'installation-scheduled', label: 'Installation Scheduled' },
  { status: 'installation-in-progress', label: 'Installation In Progress' },
  { status: 'installation-completed', label: 'Installation Completed' },
  { status: 'testing-and-handover', label: 'Testing & Handover' },
  { status: 'project-completed', label: 'Project Completed' },
]);

export const PROJECT_LIFECYCLE_STATUSES = PROJECT_LIFECYCLE.map(({ status }) => status);

export const lifecycleProgress = (status) => {
  const index = PROJECT_LIFECYCLE_STATUSES.indexOf(status);
  if (index < 0) return 0;
  return Math.round((index / (PROJECT_LIFECYCLE.length - 1)) * 100);
};
