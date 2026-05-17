import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL, authService, deviceService } from '../services/api';

const AuthContext = createContext();

// Make sure FileSystem paths are only used on native platforms
const ACCOUNTS_PATH = Platform.OS !== 'web' ? `${FileSystem.documentDirectory}accounts.json` : '';
const SESSION_PATH = Platform.OS !== 'web' ? `${FileSystem.documentDirectory}session.json` : '';
const USERS_ROOT_PATH = Platform.OS !== 'web' ? `${FileSystem.documentDirectory}users/` : '';
const RESET_MARKER_PATH = Platform.OS !== 'web' ? `${FileSystem.documentDirectory}reset-all-complete.json` : '';
const FORCE_RESET_ON_NEXT_LAUNCH = true;

const DEVICE_TEMPLATES = [
  { os: 'android', name: 'Android Cloud OS', storage: '500', isFree: true },
  { os: 'ios', name: 'iPhone Cloud OS', storage: '500', isFree: true },
];

const slugifyEmail = (email) => email.trim().toLowerCase();
const createId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const normalizeDigits = (value) => String(value || '').replace(/\D+/g, '');
const normalizeUsername = (value) => String(value || '').trim().replace(/\s+/g, '').toLowerCase();
const normalizeServerUserId = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const userId = Number(text);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
};
const isInvalidUserIdError = (error) => {
  const responseData = error?.response?.data;
  const message = String(responseData?.message || error?.message || '').toLowerCase();
  return (
    error?.response?.status === 422 &&
    (
      message.includes('selected user id is invalid') ||
      Array.isArray(responseData?.errors?.user_id)
    )
  );
};
const hashString = (value) => {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

const buildDevicePhoneNumber = ({ accountPhoneNumber, deviceId, deviceIndex }) => {
  const baseDigits = normalizeDigits(accountPhoneNumber);
  const targetLength = Math.max(10, Math.min(15, baseDigits.length || 11));
  const suffixSeed = `${baseDigits}-${deviceId}-${deviceIndex}`;
  const suffix = String((hashString(suffixSeed) % 10000 + deviceIndex) % 10000).padStart(4, '0');
  const prefixLength = targetLength - suffix.length;
  const fallbackPrefix = '700000000000000'.slice(0, prefixLength);
  const prefix = (baseDigits || fallbackPrefix).padEnd(prefixLength, '0').slice(0, prefixLength);

  return `${prefix}${suffix}`;
};

const attachDevicePhoneNumbers = (devices, accountPhoneNumber) => (
  (devices || []).map((device, index) => ({
    ...device,
    phoneNumber: normalizeDigits(device.phoneNumber) || buildDevicePhoneNumber({
      accountPhoneNumber,
      deviceId: device.id,
      deviceIndex: index,
    }),
  }))
);
const getApiErrorMessage = (error, fallbackMessage) => {
  const responseData = error?.response?.data;
  const parsedResponseData = typeof responseData === 'string'
    ? (() => {
        try {
          return JSON.parse(responseData);
        } catch {
          return null;
        }
      })()
    : responseData;

  if (parsedResponseData?.message) {
    return parsedResponseData.message;
  }

  if (parsedResponseData?.errors) {
    const firstFieldError = Object.values(parsedResponseData.errors).find(
      (messages) => Array.isArray(messages) && messages.length
    );

    if (firstFieldError) {
      return firstFieldError[0];
    }
  }

  if (error?.response?.status >= 500) {
    return 'The server could not complete the request. Check that Laravel and MySQL are both running, then try again.';
  }

  if (error?.code === 'ECONNABORTED') {
    return 'Request timed out. Check that the Laravel server is running and reachable.';
  }

  if (error?.message === 'Network Error') {
    return `Cannot reach the live API server at ${API_URL}. Check your internet connection and server availability.`;
  }

  return fallbackMessage;
};

const createDefaultDevices = (accountPhoneNumber = '') => attachDevicePhoneNumbers(
  DEVICE_TEMPLATES.map((device) => ({
    ...device,
    id: createId(device.os),
    createdAt: new Date().toISOString(),
  })),
  accountPhoneNumber
);

const syncAccountDevices = async (account, options = {}) => {
  const { required = false } = options;
  const serverUserId = normalizeServerUserId(account?.id);

  if (!serverUserId || !Array.isArray(account?.devices) || account.devices.length === 0) {
    return;
  }

  try {
    await deviceService.sync({
      userId: serverUserId,
      devices: account.devices,
    });
  } catch (error) {
    if (isInvalidUserIdError(error) && !required) {
      return;
    }

    console.log('Failed to sync device registry:', error?.response?.data?.message || error?.message || error);
    if (required) {
      throw error;
    }
  }
};

export const AuthProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const buildAccountRecord = useCallback((user, existingAccount = null, options = {}) => {
    const { allowCachedIdentity = true } = options;
    const serverUsername = normalizeUsername(user.username || '');
    const cachedUsername = allowCachedIdentity ? normalizeUsername(existingAccount?.username || '') : '';
    const resolvedUsername = serverUsername || cachedUsername || '';
    const resolvedProfilePicture = user.profile_picture || (allowCachedIdentity ? existingAccount?.profilePicture : null) || null;

    return {
      id: user.id,
      name: user.name,
      username: resolvedUsername,
      email: slugifyEmail(user.email),
      phoneNumber: user.phone_number || existingAccount?.phoneNumber || '',
      profilePicture: resolvedProfilePicture,
      createdAt: user.created_at || existingAccount?.createdAt || new Date().toISOString(),
      devices: attachDevicePhoneNumbers(
        Array.isArray(existingAccount?.devices) && existingAccount.devices.length
          ? existingAccount.devices
          : createDefaultDevices(user.phone_number || existingAccount?.phoneNumber || ''),
        user.phone_number || existingAccount?.phoneNumber || ''
      ),
    };
  }, []);

  const upsertAccount = useCallback((user) => {
    const normalizedEmail = slugifyEmail(user.email);
    const existingAccount = accounts.find((account) => (
      String(account.id) === String(user.id) || account.email === normalizedEmail
    ));
    const nextAccount = buildAccountRecord(user, existingAccount, { allowCachedIdentity: false });
    const nextAccounts = existingAccount
      ? accounts.map((account) => (
        String(account.id) === String(existingAccount.id) || account.email === existingAccount.email
          ? nextAccount
          : account
      ))
      : [...accounts, nextAccount];

    return { nextAccounts, nextAccount };
  }, [accounts, buildAccountRecord]);

  const resetAllPersistedData = useCallback(async () => {
    if (Platform.OS === 'web') {
      localStorage.removeItem('cloud_mobile_accounts');
      localStorage.removeItem('cloud_mobile_session');
      setAccounts([]);
      setCurrentUserId(null);
      return;
    }

    const targets = [ACCOUNTS_PATH, SESSION_PATH, USERS_ROOT_PATH];

    for (const target of targets) {
      try {
        const info = await FileSystem.getInfoAsync(target);
        if (info.exists) {
          await FileSystem.deleteAsync(target, { idempotent: true });
        }
      } catch (error) {
        console.error(`Failed to delete ${target}:`, error);
      }
    }

    await FileSystem.writeAsStringAsync(
      RESET_MARKER_PATH,
      JSON.stringify({ completedAt: new Date().toISOString() })
    );

    setAccounts([]);
    setCurrentUserId(null);
  }, []);

  const persistAccounts = useCallback(async (nextAccounts) => {
    if (Platform.OS === 'web') {
      localStorage.setItem('cloud_mobile_accounts', JSON.stringify(nextAccounts));
      return;
    }
    await FileSystem.writeAsStringAsync(ACCOUNTS_PATH, JSON.stringify(nextAccounts));
  }, []);

  const persistSession = useCallback(async (userId) => {
    if (Platform.OS === 'web') {
      localStorage.setItem('cloud_mobile_session', JSON.stringify({ currentUserId: userId || null }));
      return;
    }
    await FileSystem.writeAsStringAsync(
      SESSION_PATH,
      JSON.stringify({ currentUserId: userId || null })
    );
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      try {
        if (Platform.OS === 'web') {
          const storedAccounts = localStorage.getItem('cloud_mobile_accounts');
          const storedSession = localStorage.getItem('cloud_mobile_session');
          
          let loadedAccounts = storedAccounts ? JSON.parse(storedAccounts) : [];
          const normalizedAccounts = loadedAccounts.map((account) => (
            buildAccountRecord(account, account, { allowCachedIdentity: false })
          ));

          setAccounts(normalizedAccounts);

          if (storedAccounts && JSON.stringify(loadedAccounts) !== JSON.stringify(normalizedAccounts)) {
            await persistAccounts(normalizedAccounts);
          }

          if (storedSession) {
            const session = JSON.parse(storedSession);
            setCurrentUserId(session.currentUserId || null);
          }
          return;
        }

        if (FORCE_RESET_ON_NEXT_LAUNCH) {
          const resetMarkerInfo = await FileSystem.getInfoAsync(RESET_MARKER_PATH);
          if (!resetMarkerInfo.exists) {
            await resetAllPersistedData();
          }
        }

        const [accountsInfo, sessionInfo] = await Promise.all([
          FileSystem.getInfoAsync(ACCOUNTS_PATH),
          FileSystem.getInfoAsync(SESSION_PATH),
        ]);

        let loadedAccounts = [];

        if (accountsInfo.exists) {
          const accountsContent = await FileSystem.readAsStringAsync(ACCOUNTS_PATH);
          loadedAccounts = JSON.parse(accountsContent);
        }

    const normalizedAccounts = loadedAccounts.map((account) => (
      buildAccountRecord(account, account, { allowCachedIdentity: false })
    ));

        setAccounts(normalizedAccounts);

        if (accountsInfo.exists && JSON.stringify(loadedAccounts) !== JSON.stringify(normalizedAccounts)) {
          await persistAccounts(normalizedAccounts);
        }

        if (sessionInfo.exists) {
          const sessionContent = await FileSystem.readAsStringAsync(SESSION_PATH);
          const session = JSON.parse(sessionContent);
          setCurrentUserId(session.currentUserId || null);
        }
      } catch (error) {
        console.error('Failed to hydrate auth state:', error);
      } finally {
        setIsHydrated(true);
      }
    };

    hydrate();
  }, [buildAccountRecord, persistAccounts, resetAllPersistedData]);

  const currentUser = useMemo(
    () => accounts.find((account) => account.id === currentUserId) || null,
    [accounts, currentUserId]
  );

  const register = useCallback(async ({ name, email, phoneNumber, password }) => {
    try {
      const response = await authService.register({
        name: String(name || '').trim(),
        email: String(email || '').trim().toLowerCase(),
        phoneNumber,
        password: String(password || '').trim(),
      });
      const { nextAccounts, nextAccount } = upsertAccount(response.user);

      setAccounts(nextAccounts);
      setCurrentUserId(nextAccount.id);
      await persistAccounts(nextAccounts);
      await persistSession(nextAccount.id);
      syncAccountDevices(nextAccount).catch(() => {});

      return { ok: true, user: nextAccount };
    } catch (error) {
      return {
        ok: false,
        error: getApiErrorMessage(
          error,
          'Account was created, but the app could not save the generated device phone numbers. Please try signing in again.'
        ),
      };
    }
  }, [persistAccounts, persistSession, upsertAccount]);

  const login = useCallback(async ({ email, password }) => {
    try {
      const response = await authService.login({
        email: String(email || '').trim().toLowerCase(),
        password: String(password || '').trim(),
      });
      const { nextAccounts, nextAccount } = upsertAccount(response.user);

      setAccounts(nextAccounts);
      setCurrentUserId(nextAccount.id);
      await persistAccounts(nextAccounts);
      await persistSession(nextAccount.id);
      syncAccountDevices(nextAccount).catch(() => {});

      return { ok: true, user: nextAccount };
    } catch (error) {
      return {
        ok: false,
        error: getApiErrorMessage(error, 'Invalid email or password.'),
      };
    }
  }, [persistAccounts, persistSession, upsertAccount]);

  const logout = useCallback(async () => {
    setCurrentUserId(null);
    await persistSession(null);
  }, [persistSession]);

  const updateDeviceStorage = useCallback(async ({ userId, deviceId, storage }) => {
    const normalizedStorage = String(Number(storage) || 0);
    if (!userId || !deviceId || !Number(normalizedStorage)) {
      return { ok: false, error: 'Invalid device storage update.' };
    }

    let updated = false;
    const nextAccounts = accounts.map((account) => {
      if (String(account.id) !== String(userId)) {
        return account;
      }

      const nextDevices = (account.devices || []).map((device) => {
        if (device.id !== deviceId) {
          return device;
        }

        updated = true;
        return {
          ...device,
          storage: normalizedStorage,
          upgradedAt: new Date().toISOString(),
        };
      });

      return {
        ...account,
        devices: nextDevices,
      };
    });

    if (!updated) {
      return { ok: false, error: 'Device not found.' };
    }

    setAccounts(nextAccounts);
    await persistAccounts(nextAccounts);
    const updatedAccount = nextAccounts.find((account) => String(account.id) === String(userId));
    await syncAccountDevices(updatedAccount);

    return { ok: true };
  }, [accounts, persistAccounts]);

  const updateAccount = useCallback(async ({ userId, name, password }) => {
    if (!userId || !String(name || '').trim()) {
      return { ok: false, error: 'Full name is required.' };
    }

    try {
      const response = await authService.updateProfile({
        userId,
        name: String(name).trim(),
        password,
      });
      const { nextAccounts, nextAccount } = upsertAccount(response.user);

      setAccounts(nextAccounts);
      await persistAccounts(nextAccounts);

      return { ok: true, user: nextAccount };
    } catch (error) {
      return {
        ok: false,
        error: getApiErrorMessage(error, 'Unable to update account.'),
      };
    }
  }, [persistAccounts, upsertAccount]);

  const value = useMemo(() => ({
    accounts,
    currentUser,
    isAuthenticated: !!currentUser,
    isHydrated,
    login,
    logout,
    register,
    updateAccount,
    updateDeviceStorage,
  }), [accounts, currentUser, isHydrated, login, logout, register, updateAccount, updateDeviceStorage]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
