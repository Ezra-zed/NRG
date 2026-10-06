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

// Customer-facing order journey. The original quote/procurement lifecycle
// remains available for existing clients and history records.
export const ORDER_STAGES = Object.freeze([
  { status: 'order-placed', label: 'Order Placed' },
  { status: 'order-confirmed', label: 'Order Confirmed' },
  { status: 'installer-assigned', label: 'Installer Assigned' },
  { status: 'site-survey', label: 'Site Survey' },
  { status: 'installation-scheduled', label: 'Installation Scheduled' },
  { status: 'installation-in-progress', label: 'Installation In Progress' },
  { status: 'installation-completed', label: 'Installation Completed' },
]);
export const ORDER_STAGE_STATUSES = ORDER_STAGES.map(({ status }) => status);
export const orderStageProgress = (status) => {
  const index = ORDER_STAGE_STATUSES.indexOf(status);
  return index < 0 ? 0 : Math.round((index / (ORDER_STAGES.length - 1)) * 100);
};

export const lifecycleProgress = (status) => {
  const index = PROJECT_LIFECYCLE_STATUSES.indexOf(status);
  if (index < 0) return 0;
  return Math.round((index / (PROJECT_LIFECYCLE.length - 1)) * 100);
};
