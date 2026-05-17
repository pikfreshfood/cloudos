import * as BackgroundTask from 'expo-background-task';
import * as FileSystem from 'expo-file-system/legacy';
import * as TaskManager from 'expo-task-manager';
import * as Contacts from 'expo-contacts';
import { contactService } from '../services/api';

export const CONTACT_SYNC_TASK_NAME = 'cloudos-contact-sync';

const STATE_PATH = `${FileSystem.documentDirectory || ''}cloudos-contact-sync.json`;
const NETWORK_RETRY_DELAY_MS = 10000;
const DEFAULT_STATE = {
  enabled: false,
  status: 'idle',
  lastRunAt: null,
  lastResult: null,
  lastError: null,
  lastRequestedAt: null,
};

let contactSyncRetryTimer = null;

const isDifferentConsumerTaskError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('invalid task consumer') ||
    message.includes('different consumer class') ||
    message.includes('invalidconsumerclassexception')
  );
};

const unregisterContactSyncTaskRegistrationAsync = async () => {
  try {
    await BackgroundTask.unregisterTaskAsync(CONTACT_SYNC_TASK_NAME);
    return true;
  } catch (error) {
    if (!isDifferentConsumerTaskError(error)) {
      throw error;
    }

    await TaskManager.unregisterTaskAsync(CONTACT_SYNC_TASK_NAME);
    return true;
  }
};

const getRegisteredContactSyncTaskAsync = async () => {
  const tasks = await TaskManager.getRegisteredTasksAsync();
  return tasks.find((task) => task.taskName === CONTACT_SYNC_TASK_NAME) || null;
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

const readContactSyncState = async () => {
  const state = await readJsonFile(STATE_PATH, DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...state };
};

const writeContactSyncState = async (state) => {
  await FileSystem.writeAsStringAsync(STATE_PATH, JSON.stringify({ ...DEFAULT_STATE, ...state }));
};

export const isContactSyncEnabled = async () => {
  const state = await readContactSyncState();
  return state.enabled;
};

export const requestContactSyncPermission = async () => {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
};

export const enableContactSync = async ({ userId, deviceId } = {}) => {
  const state = await readContactSyncState();
  state.enabled = true;
  state.userId = userId;
  state.deviceId = deviceId;
  state.status = 'queued';
  state.lastError = null;
  state.lastRequestedAt = new Date().toISOString();
  await writeContactSyncState(state);
  await registerContactSyncTaskAsync();
};

export const disableContactSync = async () => {
  if (contactSyncRetryTimer) {
    clearTimeout(contactSyncRetryTimer);
    contactSyncRetryTimer = null;
  }

  const state = await readContactSyncState();
  state.enabled = false;
  state.status = 'stopped';
  await writeContactSyncState(state);
  await unregisterContactSyncTaskAsync();
};

const scheduleContactSyncRetry = async () => {
  if (contactSyncRetryTimer) return;

  const state = await readContactSyncState();
  if (!state.enabled || !state.userId) return;

  contactSyncRetryTimer = setTimeout(async () => {
    contactSyncRetryTimer = null;

    try {
      const latestState = await readContactSyncState();
      if (!latestState.enabled || !latestState.userId) return;

      await registerContactSyncTaskAsync();
      await runContactSync({
        userId: latestState.userId,
        deviceId: latestState.deviceId,
      });
    } catch (error) {
      if (isNetworkSyncError(error)) {
        await scheduleContactSyncRetry();
      }
    }
  }, NETWORK_RETRY_DELAY_MS);
};

export const runContactSync = async ({ userId, deviceId, onProgress } = {}) => {
  const state = await readContactSyncState();
  const syncUserId = userId || state.userId;
  const syncDeviceId = deviceId || state.deviceId;
  if (!state.enabled || !syncUserId) return { synced: 0, total: 0 };
  if (!syncDeviceId) {
    return {
      synced: 0,
      total: 0,
      error: 'Select a Cloud OS device before syncing phone contacts.',
    };
  }

  const result = { synced: 0, total: 0, networkError: false };
  state.lastRunAt = new Date().toISOString();
  state.status = 'syncing';
  state.lastError = null;
  await writeContactSyncState(state);

    try {
      const remoteResponse = await contactService.list({ userId: syncUserId, deviceId: syncDeviceId });
      const remoteContacts = remoteResponse.contacts || [];
      const remoteByPhone = {};
      for (const c of remoteContacts) {
        remoteByPhone[c.phone_number] = c;
      }

      let deviceContacts = [];
      try {
        const hasPermission = await requestContactSyncPermission();
        if (!hasPermission) {
          result.error = 'Contacts permission denied';
          state.lastResult = result;
          state.status = 'error';
          state.lastError = result.error;
          await writeContactSyncState(state);
          return result;
        }
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        for (const contact of data || []) {
          const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || '';
          const phones = (contact.phoneNumbers || []).map((p) => p.number?.replace(/\D+/g, '')).filter(Boolean);
          for (const phone of phones) {
            if (phone) deviceContacts.push({ name, phone });
          }
        }
      } catch (e) {
        console.log('Cannot access device contacts:', e?.message);
        result.error = 'Cannot access device contacts';
        state.lastResult = result;
        state.status = 'error';
        state.lastError = result.error;
        await writeContactSyncState(state);
        return result;
      }

      result.total = deviceContacts.length;
      for (let i = 0; i < deviceContacts.length; i++) {
        const dc = deviceContacts[i];
        onProgress?.({ current: i + 1, total: deviceContacts.length, name: dc.name });

        if (!remoteByPhone[dc.phone]) {
          try {
            await contactService.save({
              userId: syncUserId,
              deviceId: syncDeviceId,
              name: dc.name || dc.phone,
              phoneNumber: dc.phone,
            });
            result.synced++;
          } catch (saveError) {
            console.log('Failed to save contact:', dc.name, saveError?.response?.data?.message || saveError?.message);
            if (isNetworkSyncError(saveError)) {
              result.networkError = true;
              result.error = saveError?.message || 'Network connection failed';
              break;
            }
          }
        }
      }

      state.lastResult = result;
      state.status = result.error ? 'error' : 'active';
      state.lastError = result.error || null;
    } catch (error) {
      result.error = error?.response?.data?.message || error?.message || 'API connection failed';
      result.networkError = isNetworkSyncError(error);
      state.lastResult = { ...result, error: result.error };
      state.status = 'error';
      state.lastError = result.error;
    }

  await writeContactSyncState(state);

  if (result.networkError) {
    await scheduleContactSyncRetry();
  }

  return result;
};

export const registerContactSyncTaskAsync = async () => {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      return false;
    }

    const registeredTask = await getRegisteredContactSyncTaskAsync();
    if (registeredTask?.taskType === 'expo-background-task') return true;
    if (registeredTask) {
      await unregisterContactSyncTaskRegistrationAsync();
    }

    await BackgroundTask.registerTaskAsync(CONTACT_SYNC_TASK_NAME, {
      minimumInterval: 15,
    });

    return true;
  } catch (error) {
    console.log('Contact sync background registration failed:', error?.message || error);
    return false;
  }
};

export const unregisterContactSyncTaskAsync = async () => {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(CONTACT_SYNC_TASK_NAME);
    if (registered) {
      await unregisterContactSyncTaskRegistrationAsync();
    }
    return true;
  } catch (error) {
    console.log('Failed to unregister contact sync task:', error?.message || error);
    return false;
  }
};

export const restoreContactSyncTaskAsync = async () => {
  const state = await readContactSyncState();

  if (!state.enabled || !state.userId) return false;

  if (state.lastResult?.networkError) {
    await scheduleContactSyncRetry();
  }

  return registerContactSyncTaskAsync();
};

if (!TaskManager.isTaskDefined(CONTACT_SYNC_TASK_NAME)) {
  TaskManager.defineTask(CONTACT_SYNC_TASK_NAME, async () => {
    try {
      const state = await readContactSyncState();
      if (!state.enabled || !state.userId || !state.deviceId) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      const result = await runContactSync({ userId: state.userId, deviceId: state.deviceId });
      return result.ok === false
        ? BackgroundTask.BackgroundTaskResult.Failed
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.log('Background contact sync failed:', error?.message || error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}
