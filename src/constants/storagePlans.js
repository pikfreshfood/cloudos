export const STORAGE_UPGRADE_OPTIONS = [
  { storageMb: 2048, priceNgn: 500, billingPeriod: 'yearly' },
  { storageMb: 4096, priceNgn: 1000, billingPeriod: 'yearly' },
  { storageMb: 8192, priceNgn: 1800, billingPeriod: 'yearly' },
  { storageMb: 16384, priceNgn: 2800, billingPeriod: 'yearly' },
  { storageMb: 32768, priceNgn: 4000, billingPeriod: 'yearly' },
  { storageMb: 65536, priceNgn: 5500, billingPeriod: 'yearly' },
  { storageMb: 131072, priceNgn: 6800, billingPeriod: 'yearly' },
  { storageMb: 256000, priceNgn: 8000, billingPeriod: 'yearly' },
];

export const formatStoragePlan = (storageMb) => {
  if (storageMb >= 1024) {
    return `${(storageMb / 1024).toFixed(storageMb % 1024 === 0 ? 0 : 1)} GB`;
  }

  return `${storageMb} MB`;
};

export const formatNgn = (amount) => `\u20A6${Number(amount).toLocaleString()}`;

export const formatStoragePlanPrice = (plan) => `${formatStoragePlan(plan.storageMb)} - ${formatNgn(plan.priceNgn)}/year`;

export const formatStorageExpiry = (value) => {
  if (!value) return 'Not active';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not active';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatStorageDaysLeft = (value) => {
  if (!value) return 'No yearly period';

  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return 'No yearly period';

  const msLeft = expiresAt.getTime() - Date.now();
  if (msLeft <= 0) return 'Expired';

  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
};
