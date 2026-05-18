import * as FileSystem from 'expo-file-system/legacy';

export const DEFAULT_DEVICE_STORAGE_MB = 100;

export const getDeviceStorageLimitBytes = (device) => {
  const storageMb = Number(device?.storage || DEFAULT_DEVICE_STORAGE_MB);
  return storageMb * 1024 * 1024;
};

export const calculateDirectorySize = async (dirPath) => {
  if (!dirPath) return 0;

  let totalSize = 0;

  const scanDirectory = async (path) => {
    const dirInfo = await FileSystem.getInfoAsync(path);
    if (!dirInfo.exists || !dirInfo.isDirectory) {
      return;
    }

    const items = await FileSystem.readDirectoryAsync(path);
    for (const item of items) {
      if (item.startsWith('.')) continue;

      const itemPath = `${path}${item}`;
      const info = await FileSystem.getInfoAsync(itemPath);

      if (info.isDirectory) {
        await scanDirectory(`${itemPath}/`);
      } else if (info.size) {
        totalSize += info.size;
      }
    }
  };

  try {
    await scanDirectory(dirPath);
  } catch (error) {
    // Fresh devices may not have their storage folders created yet.
    return 0;
  }

  return totalSize;
};

export const getDeviceStorageSnapshot = async ({ baseDir, device }) => {
  const usedBytes = await calculateDirectorySize(baseDir);
  const maxBytes = getDeviceStorageLimitBytes(device);

  return {
    usedBytes,
    maxBytes,
    availableBytes: Math.max(maxBytes - usedBytes, 0),
  };
};

export const ensureDeviceHasSpace = async ({ baseDir, device, incomingBytes = 0 }) => {
  const snapshot = await getDeviceStorageSnapshot({ baseDir, device });
  return {
    ...snapshot,
    ok: snapshot.usedBytes + incomingBytes <= snapshot.maxBytes,
  };
};
