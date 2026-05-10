export const STORAGE_UPGRADE_OPTIONS = [
  { storageMb: 2048, priceNgn: 500 },
  { storageMb: 4096, priceNgn: 1000 },
  { storageMb: 8192, priceNgn: 1800 },
  { storageMb: 16384, priceNgn: 2800 },
  { storageMb: 32768, priceNgn: 4000 },
  { storageMb: 65536, priceNgn: 5500 },
  { storageMb: 131072, priceNgn: 6800 },
  { storageMb: 256000, priceNgn: 8000 },
];

export const formatStoragePlan = (storageMb) => {
  if (storageMb >= 1024) {
    return `${(storageMb / 1024).toFixed(storageMb % 1024 === 0 ? 0 : 1)} GB`;
  }

  return `${storageMb} MB`;
};

export const formatNgn = (amount) => `\u20A6${Number(amount).toLocaleString()}`;
