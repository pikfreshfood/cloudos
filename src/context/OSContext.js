import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from './AuthContext';
const OSContext = createContext();
export const OSProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [osType, setOsType] = useState('android'); // 'android' or 'ios'
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const currentDevice = useMemo(
    () => currentUser?.devices?.find((device) => device.id === currentDeviceId) || null,
    [currentDeviceId, currentUser]
  );
  const getDeviceStorageDir = (device) => {
    if (!currentUser?.id || !device?.id) return '';
    if (Platform.OS === 'web') return `/users/${currentUser.id}/devices/${device.id}/`;
    return `${FileSystem.documentDirectory}users/${currentUser.id}/devices/${device.id}/`;
  };

  const getStorageRoot = () => {
    if (Platform.OS === 'ios') {
      return FileSystem.documentDirectory || '';
    }
    if (Platform.OS === 'android') {
      return FileSystem.documentDirectory || '';
    }
    return '';
  };

  const ensureDeviceFolders = async (device) => {
    const deviceRoot = getDeviceStorageDir(device);
    if (!deviceRoot) return '';

    if (Platform.OS === 'web') return deviceRoot; // Skip real FS creation on web

    const requiredSubfolders = ['Camera/', 'Downloads/'];
    const rootInfo = await FileSystem.getInfoAsync(deviceRoot);
    if (!rootInfo.exists) {
      await FileSystem.makeDirectoryAsync(deviceRoot, { intermediates: true });
    }

    for (const subfolder of requiredSubfolders) {
      const folderPath = `${deviceRoot}${subfolder}`;
      const folderInfo = await FileSystem.getInfoAsync(folderPath);
      if (!folderInfo.exists) {
        await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
      }
    }

    return deviceRoot;
  };

  useEffect(() => {
    const initStorage = async () => {
      if (!currentUser?.devices?.length) {
        setCurrentDeviceId(null);
        setOsType('android');
        return;
      }

      try {
        for (const device of currentUser.devices) {
          await ensureDeviceFolders(device);
        }

        if (!currentDeviceId) {
          setOsType('android');
          return;
        }

        const activeDevice = currentUser.devices.find((device) => device.id === currentDeviceId);
        if (!activeDevice) {
          setCurrentDeviceId(null);
          setOsType('android');
          return;
        }

        setOsType(activeDevice.os);
      } catch (error) {
        console.error('Failed to initialize device directories:', error);
      }
    };

    initStorage();
  }, [currentDeviceId, currentUser]);

  const getStorageDir = () => {
    return currentDevice ? getDeviceStorageDir(currentDevice) : '';
  };

  const selectDevice = (device) => {
    if (!device) {
      setCurrentDeviceId(null);
      setOsType('android');
      return;
    }
    setCurrentDeviceId(device.id);
    setOsType(device.os);
  };

  const clearCurrentDevice = () => {
    setCurrentDeviceId(null);
    setOsType('android');
  };

  return (
    <OSContext.Provider
      value={{
        osType,
        setOsType,
        getStorageDir,
        getStorageRoot,
        currentDevice,
        currentDeviceId,
        selectDevice,
        clearCurrentDevice,
      }}
    >
      {children}
    </OSContext.Provider>
  );
};
export const useOS = () => useContext(OSContext);