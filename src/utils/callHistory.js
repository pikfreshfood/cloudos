import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const buildRecentCallsStorageKey = (userId) => `cloud_mobile_recent_calls_${userId}`;

const getRecentCallsPath = (userId) => (
  Platform.OS !== 'web' && userId
    ? `${FileSystem.documentDirectory}users/${userId}/recent-calls.json`
    : ''
);

export const loadRecentCalls = async (userId) => {
  if (!userId) return [];

  try {
    if (Platform.OS === 'web') {
      const storedValue = localStorage.getItem(buildRecentCallsStorageKey(userId));
      return storedValue ? JSON.parse(storedValue) : [];
    }

    const recentCallsPath = getRecentCallsPath(userId);
    const info = await FileSystem.getInfoAsync(recentCallsPath);
    if (!info.exists) return [];

    const content = await FileSystem.readAsStringAsync(recentCallsPath);
    const parsed = content ? JSON.parse(content) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveRecentCalls = async (userId, recentCalls) => {
  if (!userId) return;

  if (Platform.OS === 'web') {
    localStorage.setItem(buildRecentCallsStorageKey(userId), JSON.stringify(recentCalls || []));
    return;
  }

  const userDir = `${FileSystem.documentDirectory}users/${userId}/`;
  await FileSystem.makeDirectoryAsync(userDir, { intermediates: true });
  await FileSystem.writeAsStringAsync(getRecentCallsPath(userId), JSON.stringify(recentCalls || []));
};

export const upsertRecentCall = async (userId, callEntry) => {
  if (!userId || !callEntry?.phone_number) return [];

  const existingCalls = await loadRecentCalls(userId);
  const entry = {
    id: callEntry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: callEntry.name || '',
    phone_number: String(callEntry.phone_number || '').replace(/\D+/g, ''),
    created_at: callEntry.created_at || new Date().toISOString(),
    type: callEntry.type || 'outgoing',
  };

  const nextCalls = [
    entry,
    ...existingCalls.filter((call) => call.id !== entry.id),
  ].slice(0, 100);

  await saveRecentCalls(userId, nextCalls);
  return nextCalls;
};

export const clearRecentCalls = async (userId) => {
  await saveRecentCalls(userId, []);
  return [];
};
