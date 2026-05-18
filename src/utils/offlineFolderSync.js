import * as BackgroundTask from 'expo-background-task';
import * as FileSystem from 'expo-file-system/legacy';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { fileService } from '../services/api';
import { DEFAULT_DEVICE_STORAGE_MB } from './deviceStorage';

export const OFFLINE_SYNC_TASK_NAME = 'cloudos-offline-folder-sync';

const SAF = FileSystem.StorageAccessFramework || null;
const NETWORK_RETRY_DELAY_MS = 10000;

let syncCancelled = false;
export const cancelOfflineSync = () => {
  syncCancelled = true;
  if (offlineSyncRetryTimer) {
    clearTimeout(offlineSyncRetryTimer);
    offlineSyncRetryTimer = null;
  }
};
export const resetSyncCancelled = () => { syncCancelled = false; };
let offlineSyncRetryTimer = null;

const isDifferentConsumerTaskError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('invalid task consumer') ||
    message.includes('different consumer class') ||
    message.includes('invalidconsumerclassexception')
  );
};

const unregisterOfflineSyncTaskRegistrationAsync = async () => {
  try {
    await BackgroundTask.unregisterTaskAsync(OFFLINE_SYNC_TASK_NAME);
    return true;
  } catch (error) {
    if (!isDifferentConsumerTaskError(error)) {
      throw error;
    }

    await TaskManager.unregisterTaskAsync(OFFLINE_SYNC_TASK_NAME);
    return true;
  }
};

const getRegisteredOfflineSyncTaskAsync = async () => {
  const tasks = await TaskManager.getRegisteredTasksAsync();
  return tasks.find((task) => task.taskName === OFFLINE_SYNC_TASK_NAME) || null;
};

const STATE_PATH = `${FileSystem.documentDirectory || ''}cloudos-offline-folder-sync.json`;
const DEFAULT_STATE = {
  syncActive: false,
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
  try {
    const decoded = decodeURIComponent(clean);
    const lastPathPart = decoded.split('/').filter(Boolean).pop() || '';
    const storagePart = lastPathPart.includes(':') ? lastPathPart.split(':').pop() : lastPathPart;
    return storagePart || 'Folder';
  } catch {
    return clean.split('/').pop() || 'Folder';
  }
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

const safDocumentId = (uri = '') => {
  const decoded = decodeURIComponent(String(uri || '').replace(/\/+$/g, ''));
  const markers = ['/document/', '/tree/'];
  const marker = markers.find((item) => decoded.includes(item));

  if (!marker) return '';

  const index = decoded.indexOf(marker);
  return decoded.slice(index + marker.length).replace(/\/+$/g, '');
};

const relativeSafFolderPath = (path = '', baseDir = '') => {
  const baseId = safDocumentId(baseDir);
  const pathId = safDocumentId(path);

  if (!baseId || !pathId || pathId === baseId) {
    return '';
  }

  if (!pathId.startsWith(`${baseId}/`)) {
    return '';
  }

  return pathId.slice(baseId.length + 1).replace(/^\/+|\/+$/g, '');
};

const joinFolderPath = (...parts) => (
  parts
    .map((part) => String(part || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
);

const syncUploadFolderPath = ({ folder, parentPath }) => {
  const relativePath = folder.isExternal && Platform.OS === 'android' && SAF
    ? relativeSafFolderPath(parentPath, folder.baseDir)
    : relativeFolderPath(parentPath, folder.baseDir);

  return joinFolderPath(folder.name, relativePath);
};

export const isSafUri = (uri = '') => {
  const s = String(uri).toLowerCase();
  return s.startsWith('content://') || s.startsWith('file://');
};

export const safFolderName = (uri = '') => {
  const parts = String(uri).replace(/\/+$/g, '').split('/');
  return parts.pop() || 'Folder';
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

export const addOfflineSyncFolder = async ({ folderPath, baseDir, userId, deviceId, storageMb, isExternal }) => {
  const state = await readOfflineSyncState();
  const normalizedPath = ensureTrailingSlash(folderPath);
  const folderId = `${userId}:${deviceId}:${normalizedPath}`;
  const now = new Date().toISOString();
  const syncActive = !!state.syncActive;
  const existingIndex = state.folders.findIndex((folder) => folder.id === folderId);
  const folder = {
    id: folderId,
    name: pathName(normalizedPath),
    path: normalizedPath,
    baseDir: ensureTrailingSlash(baseDir),
    userId,
    deviceId,
    storageMb: Number(storageMb || DEFAULT_DEVICE_STORAGE_MB),
    isExternal: !!isExternal,
    enabled: syncActive,
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
  if (syncActive) {
    await registerOfflineSyncTaskAsync();
  }

  return folder;
};

export const removeOfflineSyncFolder = async (folderId) => {
  const state = await readOfflineSyncState();
  state.folders = state.folders.filter((folder) => folder.id !== folderId);
  if (state.folders.length === 0) {
    state.syncActive = false;
  }
  await writeOfflineSyncState(state);

  return state;
};

export const enableOfflineSyncFolders = async ({ folderIds = null } = {}) => {
  const state = await readOfflineSyncState();
  const targetIds = folderIds ? new Set(folderIds) : null;
  const now = new Date().toISOString();

  state.syncActive = true;
  state.folders = state.folders.map((folder) => {
    if (targetIds && !targetIds.has(folder.id)) return folder;

    return {
      ...folder,
      enabled: true,
      status: 'queued',
      lastError: null,
      updatedAt: now,
    };
  });

  await writeOfflineSyncState(state);
  await registerOfflineSyncTaskAsync();

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

const collectFilesSaf = async (safUri) => {
  const rootUri = safUri.replace(/\/+$/g, '');
  const files = [];

  const getSafInfo = async (uri) => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info?.exists ? info : null;
    } catch {
      return null;
    }
  };

  const pushFile = async (uri, parentUri, info = null) => {
    const fileInfo = info || await getSafInfo(uri);
    files.push({
      name: pathName(uri),
      path: uri,
      parentPath: parentUri.endsWith('/') ? parentUri : `${parentUri}/`,
      size: Number(fileInfo?.size || 0),
      signature: `${Number(fileInfo?.size || 0)}:${Number(fileInfo?.modificationTime || 0)}:${uri}`,
    });
  };

  const scan = async (uri) => {
    const items = await SAF.readDirectoryAsync(uri);
    for (const itemUri of items) {
      const info = await getSafInfo(itemUri);

      if (info?.isDirectory) {
        await scan(itemUri);
        continue;
      }

      if (info && info.isDirectory === false) {
        await pushFile(itemUri, uri, info);
        continue;
      }

      try {
        await scan(itemUri);
      } catch {
        await pushFile(itemUri, uri, info);
      }
    }
  };

  await scan(rootUri);
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

const isNetworkSyncError = (error) => {
  const message = `${error?.response?.data?.message || error?.message || ''}`.toLowerCase();
  const code = `${error?.code || ''}`.toUpperCase();

  return (
    !error?.response
    && (
      code === 'ERR_NETWORK'
      || code === 'ECONNABORTED'
      || code === 'ETIMEDOUT'
      || message.includes('network')
      || message.includes('timeout')
      || message.includes('failed to fetch')
    )
  );
};

const uploadErrorMessage = (error) => (
  error?.response?.data?.message
  || (error?.response?.status ? `Request failed with status ${error.response.status}` : null)
  || error?.message
  || 'File upload failed.'
);

const fileUploadErrorMessage = (file, error) => (
  `${file?.name || 'File'}: ${uploadErrorMessage(error)}`
);

const uploadSyncedFile = async ({ folder, file, uploadFolderPath }) => {
  const isSafFile = folder.isExternal && Platform.OS === 'android' && SAF;
  const payload = {
    uri: file.path,
    name: file.name,
    userId: folder.userId,
    deviceId: folder.deviceId,
    folderPath: uploadFolderPath,
  };

  try {
    return await fileService.upload(payload);
  } catch (error) {
    if (isStorageFullError(error)) {
      throw error;
    }

    if (!isSafFile && isNetworkSyncError(error)) {
      throw error;
    }

    return fileService.uploadBase64(payload);
  }
};

const scheduleOfflineSyncRetry = async () => {
  if (offlineSyncRetryTimer) return;

  const state = await readOfflineSyncState();
  if (!state.syncActive || !state.folders.some((folder) => folder.enabled)) return;

  offlineSyncRetryTimer = setTimeout(async () => {
    offlineSyncRetryTimer = null;

    try {
      const latestState = await readOfflineSyncState();
      if (!latestState.syncActive || !latestState.folders.some((folder) => folder.enabled)) return;

      await registerOfflineSyncTaskAsync();
      await runOfflineFolderSync();
    } catch (error) {
      if (isNetworkSyncError(error)) {
        await scheduleOfflineSyncRetry();
      }
    }
  }, NETWORK_RETRY_DELAY_MS);
};

export const runOfflineFolderSync = async ({ folderIds = null, onProgress } = {}) => {
  syncCancelled = false;
  const state = await readOfflineSyncState();
  const targetIds = folderIds ? new Set(folderIds) : null;
  const folders = state.syncActive
    ? state.folders.filter((folder) => folder.enabled && (!targetIds || targetIds.has(folder.id)))
    : [];
  const result = {
    scannedFolders: folders.length,
    uploadedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    failedFolders: 0,
    storageFull: false,
    networkError: false,
    cancelled: false,
    lastError: null,
  };

  state.lastRunAt = new Date().toISOString();
  state.lastError = null;

  for (const folder of folders) {
    if (syncCancelled) {
      result.cancelled = true;
      break;
    }

    const folderIndex = state.folders.findIndex((item) => item.id === folder.id);
    let folderFailedFiles = 0;
    let folderNetworkError = false;

    try {
      if (folder.isExternal && Platform.OS === 'android' && SAF) {
        await SAF.readDirectoryAsync(String(folder.path || '').replace(/\/+$/g, ''));
      } else {
        const folderInfo = await FileSystem.getInfoAsync(folder.path);
        if (!folderInfo.exists || !folderInfo.isDirectory) {
          throw new Error('Marked folder no longer exists on this device.');
        }
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

      const maxBytes = Number(folder.storageMb || DEFAULT_DEVICE_STORAGE_MB) * MB;
      let { usedBytes } = await getCloudUsage({
        userId: folder.userId,
        deviceId: folder.deviceId,
        maxBytes,
      });
      const files = folder.isExternal && Platform.OS === 'android' && SAF
        ? await collectFilesSaf(folder.path)
        : await collectFiles(folder.path);

      for (const file of files) {
        if (syncCancelled) {
          result.cancelled = true;
          break;
        }

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
          const uploadFolderPath = syncUploadFolderPath({
            folder,
            parentPath: file.parentPath,
          });

          await uploadSyncedFile({ folder, file, uploadFolderPath });

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
          folderFailedFiles += 1;
          if (isNetworkSyncError(error)) {
            result.networkError = true;
            folderNetworkError = true;
          }
          state.lastError = fileUploadErrorMessage(file, error);
          result.lastError = state.lastError;

          if (folderNetworkError) {
            break;
          }
        }
      }

      if (!syncCancelled && folderIndex >= 0) {
        state.folders[folderIndex] = {
          ...state.folders[folderIndex],
          enabled: true,
          status: folderNetworkError ? 'waiting_network' : (folderFailedFiles > 0 ? 'partial' : 'synced'),
          lastSyncedAt: new Date().toISOString(),
          lastError: folderFailedFiles > 0 ? state.lastError : null,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      result.failedFolders += 1;
      const folderErrorIsNetwork = isNetworkSyncError(error);
      if (error?.code === 'STORAGE_FULL') {
        result.storageFull = true;
      }
      if (folderErrorIsNetwork) {
        result.networkError = true;
      }

      if (folderIndex >= 0) {
        state.folders[folderIndex] = {
          ...state.folders[folderIndex],
          enabled: true,
          status: folderErrorIsNetwork
            ? 'waiting_network'
            : (error?.code === 'STORAGE_FULL' ? 'waiting_storage' : 'error'),
          lastError: uploadErrorMessage(error),
          updatedAt: new Date().toISOString(),
        };
      }

      state.lastError = uploadErrorMessage(error);
      result.lastError = state.lastError;
      await writeOfflineSyncState(state);
    }
  }

  result.lastError = result.lastError || state.lastError;
  state.lastResult = result;
  await writeOfflineSyncState(state);
  syncCancelled = false;

  if (result.networkError && !result.cancelled) {
    await scheduleOfflineSyncRetry();
  }

  return result;
};

export const registerOfflineSyncTaskAsync = async () => {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      return false;
    }

    const registeredTask = await getRegisteredOfflineSyncTaskAsync();
    if (registeredTask?.taskType === 'expo-background-task') return true;
    if (registeredTask) {
      await unregisterOfflineSyncTaskRegistrationAsync();
    }

    await BackgroundTask.registerTaskAsync(OFFLINE_SYNC_TASK_NAME, {
      minimumInterval: 15,
    });

    return true;
  } catch (error) {
    console.log('Offline folder sync background registration failed:', error?.message || error);
    return false;
  }
};

export const restoreOfflineSyncTaskAsync = async () => {
  const state = await readOfflineSyncState();
  const hasEnabledFolders = state.syncActive && state.folders.some((folder) => folder.enabled);

  if (!hasEnabledFolders) return false;

  if (
    state.lastResult?.networkError
    || state.folders.some((folder) => folder.enabled && folder.status === 'waiting_network')
  ) {
    await scheduleOfflineSyncRetry();
  }

  return registerOfflineSyncTaskAsync();
};

if (!TaskManager.isTaskDefined(OFFLINE_SYNC_TASK_NAME)) {
  TaskManager.defineTask(OFFLINE_SYNC_TASK_NAME, async () => {
    try {
      const result = await runOfflineFolderSync();

      return result.cancelled
        ? BackgroundTask.BackgroundTaskResult.Failed
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.log('Background offline folder sync failed:', error?.message || error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export const unregisterOfflineSyncTaskAsync = async () => {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(OFFLINE_SYNC_TASK_NAME);
    if (registered) {
      await unregisterOfflineSyncTaskRegistrationAsync();
    }
    return true;
  } catch (error) {
    console.log('Failed to unregister offline sync task:', error?.message || error);
    return false;
  }
};

const disableAllSyncFolders = async () => {
  const state = await readOfflineSyncState();
  state.syncActive = false;
  state.folders = state.folders.map((folder) => ({
    ...folder,
    enabled: false,
    status: 'stopped',
    updatedAt: new Date().toISOString(),
  }));
  await writeOfflineSyncState(state);
  return state;
};

export const stopOfflineSync = async () => {
  cancelOfflineSync();
  await unregisterOfflineSyncTaskAsync();
  await disableAllSyncFolders();
};
