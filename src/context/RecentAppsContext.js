import React, { createContext, useState, useContext, useCallback, useMemo } from 'react';
import { useOS } from './OSContext';

export const RecentAppsContext = createContext();

export const RecentAppsProvider = ({ children }) => {
  const [recentAppsByDevice, setRecentAppsByDevice] = useState({});
  const { currentDeviceId } = useOS();

  const deviceKey = currentDeviceId || 'guest-device';

  const addRecentApp = useCallback((app) => {
    setRecentAppsByDevice((prev) => ({
      ...prev,
      [deviceKey]: (() => {
        const currentApps = prev[deviceKey] || [];
        const filtered = currentApps.filter((a) => a.id !== app.id);
        return [app, ...filtered];
      })(),
    }));
  }, [deviceKey]);

  const removeRecentApp = useCallback((appId) => {
    setRecentAppsByDevice((prev) => ({
      ...prev,
      [deviceKey]: (prev[deviceKey] || []).filter((a) => a.id !== appId),
    }));
  }, [deviceKey]);

  const clearRecentAppsForDevice = useCallback((deviceId = currentDeviceId) => {
    const targetKey = deviceId || 'guest-device';
    setRecentAppsByDevice((prev) => ({
      ...prev,
      [targetKey]: [],
    }));
  }, [currentDeviceId]);

  const recentApps = recentAppsByDevice[deviceKey] || [];
  const value = useMemo(() => ({
    recentApps,
    addRecentApp,
    removeRecentApp,
    clearRecentAppsForDevice,
  }), [recentApps, addRecentApp, removeRecentApp, clearRecentAppsForDevice]);

  return (
    <RecentAppsContext.Provider value={value}>
      {children}
    </RecentAppsContext.Provider>
  );
};

export const useRecentApps = () => useContext(RecentAppsContext);
