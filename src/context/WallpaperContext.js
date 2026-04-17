import React, { createContext, useState, useContext, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from './OSContext';

export const WallpaperContext = createContext();

const DEFAULT_IOS_WALLPAPER = 'https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?q=80&w=1000&auto=format&fit=crop';
const DEFAULT_ANDROID_WALLPAPER = null;

export const WallpaperProvider = ({ children }) => {
  const [wallpapersByDevice, setWallpapersByDevice] = useState({});
  const { osType, getStorageDir, currentDeviceId } = useOS();

  useEffect(() => {
    loadWallpaper();
  }, [currentDeviceId, osType]);

  const getDefaultWallpaper = () => (osType === 'ios' ? DEFAULT_IOS_WALLPAPER : DEFAULT_ANDROID_WALLPAPER);

  const loadWallpaper = async () => {
    const storageDir = getStorageDir();
    if (!storageDir || !currentDeviceId) return;

    const wallpaperPath = `${storageDir}wallpaper_settings.json`;

    try {
      const info = await FileSystem.getInfoAsync(wallpaperPath);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(wallpaperPath);
        const data = JSON.parse(content);
        setWallpapersByDevice((prev) => ({
          ...prev,
          [currentDeviceId]: data.wallpaper ?? getDefaultWallpaper(),
        }));
        return;
      }
    } catch (error) {
      console.error('Failed to load wallpaper:', error);
    }

    setWallpapersByDevice((prev) => ({
      ...prev,
      [currentDeviceId]: getDefaultWallpaper(),
    }));
  };

  const updateWallpaper = async (url) => {
    const storageDir = getStorageDir();
    if (!storageDir || !currentDeviceId) return;

    const wallpaperPath = `${storageDir}wallpaper_settings.json`;

    try {
      setWallpapersByDevice((prev) => ({
        ...prev,
        [currentDeviceId]: url,
      }));

      await FileSystem.writeAsStringAsync(
        wallpaperPath,
        JSON.stringify({ wallpaper: url })
      );
    } catch (error) {
      console.error('Failed to save wallpaper:', error);
    }
  };

  const resetWallpaper = async () => {
    await updateWallpaper(getDefaultWallpaper());
  };

  const currentWallpaper = currentDeviceId
    ? wallpapersByDevice[currentDeviceId] ?? getDefaultWallpaper()
    : getDefaultWallpaper();

  return (
    <WallpaperContext.Provider value={{ wallpaper: currentWallpaper, updateWallpaper, resetWallpaper }}>
      {children}
    </WallpaperContext.Provider>
  );
};

export const useWallpaper = () => useContext(WallpaperContext);
