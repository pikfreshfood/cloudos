import * as BackgroundFetch from 'expo-background-fetch';
import * as FileSystem from 'expo-file-system/legacy';
import * as TaskManager from 'expo-task-manager';
import { fileService } from '../services/api';

export const OFFLINE_SYNC_TASK_NAME = 'cloudos-offline-folder-sync';

const STATE_PATH = `${FileSystem.documentDirectory || ''}cloudos-offline-folder-sync.json`;
const DEFAULT_STATE = {
  folders: [],
  syncedFiles: {},
  lastRunAt: null,
  lastResult: null,
  lastError: null,
};

const MB = 1024 * 1024;

export class OfflineSyncStorageFullError extends Error {
  constructor(message = 'Cloud storage is full. Upgrade storage to continue syncing.') {
    super(message);
    this.name = 'OfflineSyncStorageFullError';
    this.code = 'STORAGE_FULL';
  }
}

const ensureTrailingSlash = (path = '') => (path && !path.endsWith('/') ? `${path}/` : path);

const pathName = (path = '') => {
  const clean = String(path).replace(/\/+$/g, '');
  return clean.split('/').pop() || 'Folder';
};

const parentPath = (path = '') => {
  const clean = String(path).replace(/\/+$/g, '');
  const index = clean.lastIndexOf('/');
  return index >= 0 ? `${clean.slice(0, index + 1)}` : '';
};

const relativeFolderPath = (path = '', baseDir = '') => {
  const normalizedBase = ensureTrailingSlash(baseDir);
  const normalizedPath = ensureTrailingSlash(path);

  if (!normalizedBase || !normalizedPath.startsWith(normalizedBase)) {
    return '';
  }

  return normalizedPath
    .slice(normalizedBase.length)
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
};

const readJsonFile = async (path, fallback) => {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;

    const raw = await FileSystem.readAsStringAsync(path);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const readOfflineSyncState = async () => {
  const state = await readJsonFile(STATE_PATH, DEFAULT_STATE);

  return {
    ...DEFAULT_STATE,
    ...state,
    folders: Array.isArray(state?.folders) ? state.folders : [],
    syncedFiles: state?.syncedFiles && typeof state.syncedFiles === 'object' ? state.syncedFiles : {},
  };
};

export const writeOfflineSyncState = async (state) => {
  await FileSystem.writeAsStringAsync(STATE_PATH, JSON.stringify({
    ...DEFAULT_STATE,
    ...state,
  }));
};

export const getDeviceSyncFolders = async ({ userId, deviceId }) => {
  const state = await readOfflineSyncState();

  return state.folders.filter((folder) => (
    String(folder.userId) === String(userId) &&
    String(folder.deviceId) === String(deviceId)
  ));
};

export const addOfflineSyncFolder = async ({ folderPath, baseDir, userId, deviceId, storageMb }) => {
  const state = await readOfflineSyncState();
  const normalizedPath = ensureTrailingSlash(folderPath);
  const folderId = `${userId}:${deviceId}:${normalizedPath}`;
  const now = new Date().toISOString();
  const existingIndex = state.folders.findIndex((folder) => folder.id === folderId);
  const folder = {
    id: folderId,
    name: pathName(normalizedPath),
    path: normalizedPath,
    baseDir: ensureTrailingSlash(baseDir),
    userId,
    deviceId,
    storageMb: Number(storageMb || 500),
    enabled: true,
    status: 'queued',
    lastSyncedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    state.folders[existingIndex] = {
      ...state.folders[existingIndex],
      ...folder,
      createdAt: state.folders[existingIndex].createdAt || now,
    };
  } else {
    state.folders.push(folder);
  }

  await writeOfflineSyncState(state);
  await registerOfflineSyncTaskAsync();

  return folder;
};

export const removeOfflineSyncFolder = async (folderId) => {
  const state = await readOfflineSyncState();
  state.folders = state.folders.filter((folder) => folder.id !== folderId);
  await writeOfflineSyncState(state);

  return state;
};

const collectFiles = async (folderPath) => {
  const root = ensureTrailingSlash(folderPath);
  const files = [];

  const scan = async (path) => {
    const items = await FileSystem.readDirectoryAsync(path);

    for (const item of items.filter((name) => !name.startsWith('.'))) {
      const itemPath = `${ensureTrailingSlash(path)}${item}`;
      const info = await FileSystem.getInfoAsync(itemPath);

      if (!info.exists) continue;

      if (info.isDirectory) {
        await scan(`${itemPath}/`);
      } else {
        files.push({
          name: item,
          path: itemPath,
          parentPath: ensureTrailingSlash(path),
          size: Number(info.size || 0),
          signature: `${Number(info.size || 0)}:${Number(info.modificationTime || 0)}`,
        });
      }
    }
  };

  await scan(root);

  return files;
};

const getCloudUsage = async ({ userId, deviceId, maxBytes }) => {
  const response = await fileService.list({ userId, deviceId, folderPath: '' });

  return {
    usedBytes: Number(response?.used_space || 0),
    maxBytes,
  };
};

const isStorageFullError = (error) => {
  const message = `${error?.response?.data?.message || error?.message || ''}`.toLowerCase();
  return error?.code === 'STORAGE_FULL' || /storage|space|quota|full|upgrade/.test(message);
};

export const runOfflineFolderSync = async ({ folderIds = null, onProgress } = {}) => {
  const state = await readOfflineSyncState();
  const targetIds = folderIds ? new Set(folderIds) : null;
  const folders = state.folders.filter((folder) => folder.enabled && (!targetIds || targetIds.has(folder.id)));
  const result = {
    scannedFolders: folders.length,
    uploadedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    storageFull: false,
  };

  state.lastRunAt = new Date().toISOString();
  state.lastError = null;

  for (const folder of folders) {
    const folderIndex = state.folders.findIndex((item) => item.id === folder.id);

    try {
      const folderInfo = await FileSystem.getInfoAsync(folder.path);
      if (!folderInfo.exists || !folderInfo.isDirectory) {
        throw new Error('Marked folder no longer exists on this device.');
      }

      if (folderIndex >= 0) {
        state.folders[folderIndex] = {
          ...state.folders[folderIndex],
          status: 'syncing',
          lastError: null,
          updatedAt: new Date().toISOString(),
        };
        await writeOfflineSyncState(state);
      }

      const maxBytes = Number(folder.storageMb || 500) * MB;
      let { usedBytes } = await getCloudUsage({
        userId: folder.userId,
        deviceId: folder.deviceId,
        maxBytes,
      });
      const files = await collectFiles(folder.path);

      for (const file of files) {
        const syncKey = `${folder.id}:${file.path}`;

        if (state.syncedFiles[syncKey]?.signature === file.signature) {
          result.skippedFiles += 1;
          continue;
        }

        if (usedBytes + file.size > maxBytes) {
          result.storageFull = true;
          throw new OfflineSyncStorageFullError();
        }

        onProgress?.({
          folder,
          file,
          uploadedFiles: result.uploadedFiles,
          totalFiles: files.length,
        });

        try {
          await fileService.upload({
            uri: file.path,
            name: file.name,
            userId: folder.userId,
            deviceId: folder.deviceId,
            folderPath: relativeFolderPath(file.parentPath, folder.baseDir),
          });

          usedBytes += file.size;
          result.uploadedFiles += 1;
          state.syncedFiles[syncKey] = {
            signature: file.signature,
            syncedAt: new Date().toISOString(),
          };
          await writeOfflineSyncState(state);
        } catch (error) {
          if (isStorageFullError(error)) {
            result.storageFull = true;
            throw new OfflineSyncStorageFullError(error?.response?.data?.message);
          }

          result.failedFiles += 1;
        }
      }

      if (folderIndex >= 0) {
        state.folders[folderIndex] = {
          ...state.folders[folderIndex],
          status: result.failedFiles > 0 ? 'partial' : 'synced',
          lastSyncedAt: new Date().toISOString(),
          lastError: null,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      if (folderIndex >= 0) {
        state.folders[folderIndex] = {
          ...state.folders[folderIndex],
          status: error?.code === 'STORAGE_FULL' ? 'paused' : 'error',
          lastError: error?.message || 'Sync failed.',
          updatedAt: new Date().toISOString(),
        };
      }

      state.lastError = error?.message || 'Sync failed.';
      await writeOfflineSyncState(state);

      if (error?.code === 'STORAGE_FULL') {
        throw error;
      }
    }
  }

  state.lastResult = result;
  await writeOfflineSyncState(state);

  return result;
};

export const registerOfflineSyncTaskAsync = async () => {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Denied ||
      status === BackgroundFetch.BackgroundFetchStatus.Restricted
    ) {
      return false;
    }

    const registered = await TaskManager.isTaskRegisteredAsync(OFFLINE_SYNC_TASK_NAME);
    if (registered) return true;

    await BackgroundFetch.registerTaskAsync(OFFLINE_SYNC_TASK_NAME, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    return true;
  } catch (error) {
    console.log('Offline folder sync background registration failed:', error?.message || error);
    return false;
  }
};

if (!TaskManager.isTaskDefined(OFFLINE_SYNC_TASK_NAME)) {
  TaskManager.defineTask(OFFLINE_SYNC_TASK_NAME, async () => {
    try {
      const result = await runOfflineFolderSync();

      if (result.uploadedFiles > 0) {
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }

      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.log('Background offline folder sync failed:', error?.message || error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}
