import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL, authService } from '../services/api';

const AuthContext = createContext();

const ACCOUNTS_PATH = `${FileSystem.documentDirectory}accounts.json`;
const SESSION_PATH = `${FileSystem.documentDirectory}session.json`;
const USERS_ROOT_PATH = `${FileSystem.documentDirectory}users/`;
const RESET_MARKER_PATH = `${FileSystem.documentDirectory}reset-all-complete.json`;
const FORCE_RESET_ON_NEXT_LAUNCH = true;

const DEVICE_TEMPLATES = [
  { os: 'android', name: 'Android Cloud OS', storage: '200', isFree: true },
  { os: 'ios', name: 'iPhone Cloud OS', storage: '200', isFree: true },
];

const slugifyEmail = (email) => email.trim().toLowerCase();
const createId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    return `Cannot reach the Laravel server at ${API_URL}. If you are using a real phone, 127.0.0.1 points to the phone itself, not your PC. Use an emulator, USB adb reverse, or your PC LAN IP.`;
  }

  return fallbackMessage;
};

const createDefaultDevices = () =>
  DEVICE_TEMPLATES.map((device) => ({
    ...device,
    id: createId(device.os),
    createdAt: new Date().toISOString(),
  }));

export const AuthProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const buildAccountRecord = useCallback((user, existingAccount = null) => ({
    id: String(user.id),
    name: user.name,
    email: slugifyEmail(user.email),
    phoneNumber: user.phone_number || existingAccount?.phoneNumber || '',
    createdAt: user.created_at || existingAccount?.createdAt || new Date().toISOString(),
    devices: Array.isArray(existingAccount?.devices) && existingAccount.devices.length
      ? existingAccount.devices
      : createDefaultDevices(),
  }), []);

  const upsertAccount = useCallback((user) => {
    const normalizedEmail = slugifyEmail(user.email);
    const existingAccount = accounts.find((account) => (
      String(account.id) === String(user.id) || account.email === normalizedEmail
    ));
    const nextAccount = buildAccountRecord(user, existingAccount);
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
    await FileSystem.writeAsStringAsync(ACCOUNTS_PATH, JSON.stringify(nextAccounts));
  }, []);

  const persistSession = useCallback(async (userId) => {
    await FileSystem.writeAsStringAsync(
      SESSION_PATH,
      JSON.stringify({ currentUserId: userId || null })
    );
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      try {
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

    const normalizedAccounts = loadedAccounts.map((account) => buildAccountRecord(account, account));

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

  const register = useCallback(async ({ name, email, password }) => {
    try {
      const response = await authService.register({ name, email, password });
      const { nextAccounts, nextAccount } = upsertAccount(response.user);

      setAccounts(nextAccounts);
      setCurrentUserId(nextAccount.id);
      await persistAccounts(nextAccounts);
      await persistSession(nextAccount.id);

      return { ok: true, user: nextAccount };
    } catch (error) {
      return {
        ok: false,
        error: getApiErrorMessage(
          error,
          'Account was created on the server, but the app could not finish setting up the local profile. Please try signing in.'
        ),
      };
    }
  }, [persistAccounts, persistSession, upsertAccount]);

  const login = useCallback(async ({ email, password }) => {
    try {
      const response = await authService.login({ email, password });
      const { nextAccounts, nextAccount } = upsertAccount(response.user);

      setAccounts(nextAccounts);
      setCurrentUserId(nextAccount.id);
      await persistAccounts(nextAccounts);
      await persistSession(nextAccount.id);

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
      if (account.id !== userId) {
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

    return { ok: true };
  }, [accounts, persistAccounts]);

  const value = useMemo(() => ({
    accounts,
    currentUser,
    isAuthenticated: !!currentUser,
    isHydrated,
    login,
    logout,
    register,
    updateDeviceStorage,
  }), [accounts, currentUser, isHydrated, login, logout, register, updateDeviceStorage]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
