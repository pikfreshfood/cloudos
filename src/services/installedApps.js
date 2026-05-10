import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { deviceService } from './api';

const STORE_KEY_PREFIX = 'cloud_mobile_installed_store_apps';
const UNINSTALLED_KEY_PREFIX = 'cloud_mobile_uninstalled_store_apps';

const sanitizeSegment = (value) => String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');

const getInstalledAppsPath = ({ userId, deviceId }) => (
  `${FileSystem.documentDirectory}users/${sanitizeSegment(userId)}/devices/${sanitizeSegment(deviceId)}/installed-apps.json`
);

const getStorageKey = ({ userId, deviceId }) => (
  `${STORE_KEY_PREFIX}_${sanitizeSegment(userId)}_${sanitizeSegment(deviceId)}`
);

const getUninstalledAppsPath = ({ userId, deviceId }) => (
  `${FileSystem.documentDirectory}users/${sanitizeSegment(userId)}/devices/${sanitizeSegment(deviceId)}/uninstalled-apps.json`
);

const getUninstalledStorageKey = ({ userId, deviceId }) => (
  `${UNINSTALLED_KEY_PREFIX}_${sanitizeSegment(userId)}_${sanitizeSegment(deviceId)}`
);

export const toInstalledApp = (app) => {
  const appUrl = app.app_url || app.url || app.params?.initialUrl || '';
  const storeAppId = String(app.storeAppId || app.id);
  const storageBytes = getStoreAppStorageBytes(app);

  return {
    id: `store-${storeAppId}`,
    storeAppId,
    name: app.name || app.app_name || 'App',
    description: app.description || app.app_description || '',
    iconUrl: app.icon_url || app.iconUrl || null,
    storageBytes,
    iconSizeBytes: Number(app.icon_size_bytes || app.iconSizeBytes || 0),
    screenshots: Array.isArray(app.screenshots) ? app.screenshots : [],
    type: 'remote-app',
    screen: 'BrowserScreen',
    color: '#0ea5e9',
    params: {
      initialUrl: appUrl,
      initialInputUrl: appUrl,
      minimalChrome: true,
      showBottomMenu: true,
      pageTitle: app.name || app.app_name || 'App',
    },
  };
};

export const getStoreAppStorageBytes = (app = {}) => {
  const iconBytes = Number(app.icon_size_bytes || app.iconSizeBytes || 0);
  const screenshotBytes = (Array.isArray(app.screenshots) ? app.screenshots : [])
    .reduce((total, screenshot) => total + Number(screenshot?.size_bytes || screenshot?.sizeBytes || 0), 0);

  return iconBytes + screenshotBytes || Number(app.storageBytes || 0);
};

export const loadInstalledApps = async ({ userId, deviceId }) => {
  if (!userId || !deviceId) return [];

  try {
    let localApps = [];
    const uninstalledIds = await loadUninstalledAppIds({ userId, deviceId });

    if (Platform.OS === 'web') {
      const value = localStorage.getItem(getStorageKey({ userId, deviceId }));
      localApps = value ? JSON.parse(value).map(toInstalledApp) : [];
    } else {
      const path = getInstalledAppsPath({ userId, deviceId });
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(path);
        localApps = JSON.parse(content).map(toInstalledApp);
      }
    }

    try {
      const response = await deviceService.installedApps({ userId, deviceId });
      const serverApps = (response.apps || [])
        .map(toInstalledApp)
        .filter((app) => !uninstalledIds.includes(String(app.storeAppId)));
      const byStoreId = new Map();

      [...localApps, ...serverApps]
        .filter((app) => !uninstalledIds.includes(String(app.storeAppId)))
        .forEach((app) => {
        byStoreId.set(String(app.storeAppId), app);
      });

      const mergedApps = Array.from(byStoreId.values());

      if (serverApps.length) {
        await persistInstalledApps({ userId, deviceId, apps: mergedApps });
      }

      return mergedApps;
    } catch (serverError) {
      return localApps;
    }
  } catch (error) {
    console.log('Failed to load installed store apps:', error?.message || error);
    return [];
  }
};

const persistInstalledApps = async ({ userId, deviceId, apps }) => {
  if (Platform.OS === 'web') {
    localStorage.setItem(getStorageKey({ userId, deviceId }), JSON.stringify(apps));
    return;
  }

  const path = getInstalledAppsPath({ userId, deviceId });
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  await FileSystem.writeAsStringAsync(path, JSON.stringify(apps));
};

const loadUninstalledAppIds = async ({ userId, deviceId }) => {
  if (!userId || !deviceId) return [];

  try {
    if (Platform.OS === 'web') {
      const value = localStorage.getItem(getUninstalledStorageKey({ userId, deviceId }));
      return value ? JSON.parse(value).map(String) : [];
    }

    const path = getUninstalledAppsPath({ userId, deviceId });
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return [];

    const content = await FileSystem.readAsStringAsync(path);
    return JSON.parse(content).map(String);
  } catch {
    return [];
  }
};

const persistUninstalledAppIds = async ({ userId, deviceId, appIds }) => {
  const uniqueIds = [...new Set(appIds.map(String).filter(Boolean))];

  if (Platform.OS === 'web') {
    localStorage.setItem(getUninstalledStorageKey({ userId, deviceId }), JSON.stringify(uniqueIds));
    return;
  }

  const path = getUninstalledAppsPath({ userId, deviceId });
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  await FileSystem.writeAsStringAsync(path, JSON.stringify(uniqueIds));
};

const rememberUninstalledApp = async ({ userId, deviceId, storeAppId }) => {
  const existingIds = await loadUninstalledAppIds({ userId, deviceId });
  await persistUninstalledAppIds({
    userId,
    deviceId,
    appIds: [...existingIds, String(storeAppId)],
  });
};

const forgetUninstalledApp = async ({ userId, deviceId, storeAppId }) => {
  const existingIds = await loadUninstalledAppIds({ userId, deviceId });
  await persistUninstalledAppIds({
    userId,
    deviceId,
    appIds: existingIds.filter((appId) => appId !== String(storeAppId)),
  });
};

export const saveInstalledApp = async ({ userId, deviceId, app }) => {
  if (!userId || !deviceId) {
    throw new Error('Select a device before installing apps.');
  }

  const installedApp = toInstalledApp(app);
  await forgetUninstalledApp({ userId, deviceId, storeAppId: installedApp.storeAppId });

  const existingApps = await loadInstalledApps({ userId, deviceId });
  const nextApps = [
    ...existingApps.filter((candidate) => candidate.storeAppId !== installedApp.storeAppId),
    installedApp,
  ];

  await persistInstalledApps({ userId, deviceId, apps: nextApps });

  try {
    await deviceService.syncInstalledApps({ userId, deviceId, apps: nextApps });
  } catch (error) {
    console.log('Failed to sync installed app to server:', error?.response?.data?.message || error?.message || error);
  }

  return nextApps;
};

export const removeInstalledApp = async ({ userId, deviceId, storeAppId }) => {
  if (!userId || !deviceId) return [];

  const existingApps = await loadInstalledApps({ userId, deviceId });
  const nextApps = existingApps.filter((app) => String(app.storeAppId) !== String(storeAppId));

  await rememberUninstalledApp({ userId, deviceId, storeAppId });
  await persistInstalledApps({ userId, deviceId, apps: nextApps });

  try {
    await deviceService.syncInstalledApps({ userId, deviceId, apps: nextApps });
  } catch (error) {
    console.log('Failed to sync uninstalled app to server:', error?.response?.data?.message || error?.message || error);
  }

  return nextApps;
};

export const getInstalledAppsStorageBytes = (apps = []) => (
  apps.reduce((total, app) => total + Number(app.storageBytes || 0), 0)
);
