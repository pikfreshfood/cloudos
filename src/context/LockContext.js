import React, { createContext, useState, useContext, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from './OSContext';

export const LockContext = createContext();

export const LockProvider = ({ children }) => {
  const { getStorageDir, osType } = useOS();
  const [pin, setPin] = useState('1234'); // Default PIN
  
  useEffect(() => {
    loadPin();
  }, [osType]); // Re-load pin when OS changes

  const loadPin = async () => {
    try {
      const storageDir = getStorageDir();
      if (!storageDir) return;
      const PIN_STORAGE_PATH = `${storageDir}security_settings.json`;
      
      const info = await FileSystem.getInfoAsync(PIN_STORAGE_PATH);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(PIN_STORAGE_PATH);
        const data = JSON.parse(content);
        if (data.pin) {
          setPin(data.pin);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to load PIN:', error);
    }
    // If no pin found, reset to default
    setPin('1234');
  };

  const updatePin = async (newPin) => {
    try {
      const storageDir = getStorageDir();
      if (!storageDir) return false;
      const PIN_STORAGE_PATH = `${storageDir}security_settings.json`;
      
      setPin(newPin);
      await FileSystem.writeAsStringAsync(
        PIN_STORAGE_PATH,
        JSON.stringify({ pin: newPin })
      );
      return true;
    } catch (error) {
      console.error('Failed to save PIN:', error);
      return false;
    }
  };

  const verifyPin = (inputPin) => {
    return inputPin === pin;
  };

  return (
    <LockContext.Provider value={{ pin, updatePin, verifyPin }}>
      {children}
    </LockContext.Provider>
  );
};

export const useLock = () => useContext(LockContext);