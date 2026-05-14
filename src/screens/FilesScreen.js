import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import { ensureDeviceHasSpace, getDeviceStorageLimitBytes, getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { resolveLocalRecipientDevice } from '../utils/recipientDevice';
import { API_URL, fileService, messageService } from '../services/api';
import { installApk } from '../native/apkInstaller';
import {
  OfflineSyncStorageFullError,
  addOfflineSyncFolder,
  getDeviceSyncFolders,
  registerOfflineSyncTaskAsync,
  removeOfflineSyncFolder,
  runOfflineFolderSync,
} from '../utils/offlineFolderSync';

export default function FilesScreen({ navigation }) {
  const { getStorageDir, osType, currentDevice } = useOS();
  const { accounts, currentUser } = useAuth();
  const [currentPath, setCurrentPath] = useState(getStorageDir() || '');
  const [history, setHistory] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFileTab, setActiveFileTab] = useState('cloud');
  const [syncFolders, setSyncFolders] = useState([]);
  const [syncBrowserPath, setSyncBrowserPath] = useState(getStorageDir() || '');
  const [syncBrowserHistory, setSyncBrowserHistory] = useState([]);
  const [syncBrowserFolders, setSyncBrowserFolders] = useState([]);
  const [isSyncBrowserLoading, setIsSyncBrowserLoading] = useState(false);
  const [isOfflineSyncing, setIsOfflineSyncing] = useState(false);
  const [syncProgressText, setSyncProgressText] = useState('');

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Modals
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [inputType, setInputType] = useState(''); // 'createFolder', 'rename'
  const [inputValue, setInputValue] = useState('');

  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerType, setPickerType] = useState(''); // 'move', 'copy'
  const [pickerPath, setPickerPath] = useState(getStorageDir() || '');
  const [pickerHistory, setPickerHistory] = useState([]);
  const [pickerFolders, setPickerFolders] = useState([]);
  const [totalStorageSize, setTotalStorageSize] = useState(0);

  // Sharing
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareProgress, setShareProgress] = useState(0);

  const [uploadState, setUploadState] = useState({
    visible: false,
    currentFileName: '',
    completedFiles: 0,
    totalFiles: 0,
    progress: 0,
  });
  const MAX_STORAGE_BYTES = getDeviceStorageLimitBytes(currentDevice);
  const MAX_STORAGE_MB = Math.round(MAX_STORAGE_BYTES / (1024 * 1024));
  const hasApiContext = !!currentUser?.id && !!currentDevice?.id;
  const isApkFile = (name = '') => name.toLowerCase().endsWith('.apk');

  useFocusEffect(
    useCallback(() => {
      calculateTotalStorage();
      loadFiles(currentPath);
    }, [])
  );

  const calculateTotalStorage = async () => {
    try {
      if (hasApiContext) {
        // Storage size is updated via the API response in loadFiles
        return;
      }

      const baseDir = getStorageDir() || '';
      if (!baseDir) {
        setTotalStorageSize(0);
        return;
      }

      const snapshot = await getDeviceStorageSnapshot({ baseDir, device: currentDevice });
      setTotalStorageSize(snapshot.usedBytes);
    } catch (error) {
      console.error('Failed to calculate storage size:', error);
    }
  };

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath]);

  useEffect(() => {
    const baseDir = getStorageDir() || '';
    setCurrentPath(baseDir);
    setPickerPath(baseDir);
    setSyncBrowserPath(baseDir);
    setHistory([]);
    setPickerHistory([]);
    setSyncBrowserHistory([]);
  }, [currentDevice?.id]);

  useEffect(() => {
    if (activeFileTab !== 'sync') return;

    refreshOfflineSyncFolders();
    loadSyncBrowserFolders(syncBrowserPath || getStorageDir() || '');
    registerOfflineSyncTaskAsync();
  }, [activeFileTab, syncBrowserPath, currentUser?.id, currentDevice?.id]);

  const loadFilesFromLocal = async (path) => {
    if (!path) {
      path = getStorageDir() || '';
      setCurrentPath(path);
      if (!path) {
        setIsLoading(false);
        setFiles([]);
        return;
      }
    }
    try {
      setIsLoading(true);
      const items = await FileSystem.readDirectoryAsync(path);
      
      // Filter out hidden files/folders (starting with dot) and specific system folders
      const visibleItems = items.filter(item => !item.startsWith('.'));
      
      const fileList = await Promise.all(
        visibleItems.map(async (item) => {
          const itemPath = `${path}${item}`;
          const info = await FileSystem.getInfoAsync(itemPath);
          return {
            id: item,
            name: item,
            type: info.isDirectory ? 'folder' : 'file',
            size: info.size ? `${(info.size / 1024).toFixed(2)} KB` : '',
            date: new Date(info.modificationTime * 1000).toLocaleDateString(),
            path: itemPath,
            remotePath: null,
            isRemote: false,
          };
        })
      );
      // Sort: folders first, then alphabetical
      fileList.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      });
      setFiles(fileList);
      calculateTotalStorage(); // Update storage when files change
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFiles = async (path) => {
    if (!path) {
      path = getStorageDir() || '';
      setCurrentPath(path);
      if (!path) {
        setIsLoading(false);
        setFiles([]);
        return;
      }
    }

    if (!hasApiContext) {
      console.log('Loading files from local storage');
      await loadFilesFromLocal(path);
      return;
    }

    console.log('Loading files from Laravel API', {
      userId: currentUser.id,
      deviceId: currentDevice.id,
      path,
      apiUrl: API_URL,
    });

    try {
      setIsLoading(true);
      const baseDir = getStorageDir() || '';
      const relativeFolderPath = baseDir && path.startsWith(baseDir)
        ? path.slice(baseDir.length).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
        : '';
      console.log('Relative folder path:', relativeFolderPath);
      const response = await fileService.list({
        userId: currentUser.id,
        deviceId: currentDevice.id,
        folderPath: relativeFolderPath,
      });

      console.log('API response:', response);

      if (response.used_space !== undefined) {
        setTotalStorageSize(response.used_space);
      }

      const normalized = (response.files || []).map((item) => ({
        id: item.id || `${item.type}:${item.name}`,
        name: item.name,
        type: item.type,
        size: item.size || '',
        date: item.date || '',
        path: `${path}${item.name}${item.type === 'folder' ? '/' : ''}`,
        remotePath: item.path || null,
        isRemote: true,
      }));

      setFiles(normalized);
    } catch (error) {
      console.error('Failed to load files from API:', {
        apiUrl: API_URL,
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
      });
      setFiles([]);
      const status = error?.response?.status;
      const apiMessage = error?.response?.data?.message;
      const details = apiMessage
        ? `${apiMessage}${status ? ` (HTTP ${status})` : ''}`
        : `The app could not load your Laravel-backed files right now${status ? ` (HTTP ${status})` : ''}.`;
      Alert.alert('Cloud files unavailable', details);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPickerFolders = async (path) => {
    if (!path) {
      path = getStorageDir() || '';
      setPickerPath(path);
      if (!path) return;
    }
    if (hasApiContext) {
      try {
        const baseDir = getStorageDir() || '';
        const relativeFolderPath = baseDir && path.startsWith(baseDir)
          ? path.slice(baseDir.length).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
          : '';
        const response = await fileService.list({
          userId: currentUser.id,
          deviceId: currentDevice.id,
          folderPath: relativeFolderPath,
        });
        const folderList = (response.files || [])
          .filter((item) => item.type === 'folder')
          .map((item) => ({
            id: item.id || item.path || item.name,
            name: item.name,
            path: `${path}${item.name}/`,
            remotePath: item.path || null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setPickerFolders(folderList);
        return;
      } catch (error) {
        console.error('Failed to load picker folders from API:', error);
        setPickerFolders([]);
        return;
      }
    }

    try {
      const items = await FileSystem.readDirectoryAsync(path);
      const visibleItems = items.filter(item => !item.startsWith('.'));
      
      const folderList = [];
      for (const item of visibleItems) {
        const itemPath = `${path}${item}`;
        const info = await FileSystem.getInfoAsync(itemPath);
        if (info.isDirectory) {
          folderList.push({
            id: item,
            name: item,
            path: itemPath,
            remotePath: null,
          });
        }
      }
      folderList.sort((a, b) => a.name.localeCompare(b.name));
      setPickerFolders(folderList);
    } catch (error) {
      console.error(error);
    }
  };

  const loadSyncBrowserFolders = async (path) => {
    const baseDir = getStorageDir() || '';
    const nextPath = path || baseDir;

    if (!nextPath) {
      setSyncBrowserFolders([]);
      return;
    }

    try {
      setIsSyncBrowserLoading(true);
      const items = await FileSystem.readDirectoryAsync(nextPath);
      const folders = [];

      for (const item of items.filter((name) => !name.startsWith('.'))) {
        const itemPath = `${nextPath.endsWith('/') ? nextPath : `${nextPath}/`}${item}`;
        const info = await FileSystem.getInfoAsync(itemPath);

        if (info.exists && info.isDirectory) {
          folders.push({
            id: `${itemPath}/`,
            name: item,
            path: `${itemPath}/`,
          });
        }
      }

      folders.sort((a, b) => a.name.localeCompare(b.name));
      setSyncBrowserFolders(folders);
    } catch (error) {
      console.log('Failed to browse sync folders:', error?.message || error);
      setSyncBrowserFolders([]);
    } finally {
      setIsSyncBrowserLoading(false);
    }
  };

  const refreshOfflineSyncFolders = async () => {
    if (!currentUser?.id || !currentDevice?.id) {
      setSyncFolders([]);
      return;
    }

    const folders = await getDeviceSyncFolders({
      userId: currentUser.id,
      deviceId: currentDevice.id,
    });
    setSyncFolders(folders);
  };

  const isSyncFolderMarked = (folderPath) => (
    syncFolders.some((folder) => folder.path === folderPath)
  );

  const handleBrowseSyncFolder = (folderPath) => {
    setSyncBrowserHistory((current) => [...current, syncBrowserPath || getStorageDir() || '']);
    setSyncBrowserPath(folderPath);
  };

  const handleSyncBrowserBack = () => {
    if (syncBrowserHistory.length === 0) return;

    const nextHistory = [...syncBrowserHistory];
    const previousPath = nextHistory.pop();
    setSyncBrowserHistory(nextHistory);
    setSyncBrowserPath(previousPath || getStorageDir() || '');
  };

  const handleToggleSyncFolder = async (folder) => {
    if (!hasApiContext) {
      Alert.alert('Cloud account required', 'Sign in with a Cloud OS account and select a cloud device before enabling offline sync.');
      return;
    }

    const markedFolder = syncFolders.find((item) => item.path === folder.path);

    if (markedFolder) {
      await removeOfflineSyncFolder(markedFolder.id);
      await refreshOfflineSyncFolders();
      return;
    }

    const addedFolder = await addOfflineSyncFolder({
      folderPath: folder.path,
      baseDir: getStorageDir() || '',
      userId: currentUser.id,
      deviceId: currentDevice.id,
      storageMb: currentDevice.storage || 500,
    });

    await refreshOfflineSyncFolders();
    await handleRunOfflineSync([addedFolder.id]);
  };

  const handleStorageFullAlert = () => {
    Alert.alert(
      'Cloud storage full',
      'Sync stopped because this device cloud storage is full. Upgrade storage to continue syncing.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Upgrade Storage', onPress: () => navigation.navigate('SettingsScreen') },
      ]
    );
  };

  const handleRunOfflineSync = async (folderIds = null) => {
    if (!hasApiContext) {
      Alert.alert('Cloud account required', 'Sign in with a Cloud OS account and select a cloud device before syncing offline folders.');
      return;
    }

    try {
      setIsOfflineSyncing(true);
      setSyncProgressText('Preparing offline sync...');
      await registerOfflineSyncTaskAsync();
      const result = await runOfflineFolderSync({
        folderIds,
        onProgress: ({ file }) => {
          setSyncProgressText(`Syncing ${file.name}`);
        },
      });

      await refreshOfflineSyncFolders();
      await loadFiles(currentPath);
      setSyncProgressText(result.uploadedFiles > 0
        ? `${result.uploadedFiles} file(s) synced.`
        : 'Everything is up to date.');
    } catch (error) {
      await refreshOfflineSyncFolders();

      if (error instanceof OfflineSyncStorageFullError || error?.code === 'STORAGE_FULL') {
        setSyncProgressText('Sync paused: cloud storage full.');
        handleStorageFullAlert();
      } else {
        setSyncProgressText(error?.message || 'Sync failed.');
        Alert.alert('Sync failed', error?.message || 'Could not sync offline folders right now.');
      }
    } finally {
      setIsOfflineSyncing(false);
    }
  };

  const getRelativeFolderPath = (path) => {
    const baseDir = getStorageDir() || '';

    if (!baseDir || !path || !path.startsWith(baseDir)) {
      return '';
    }

    return path.slice(baseDir.length).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  };

  const resetUploadState = () => {
    setUploadState({
      visible: false,
      currentFileName: '',
      completedFiles: 0,
      totalFiles: 0,
      progress: 0,
    });
  };

  const handleGoBack = () => {
    if (activeFileTab === 'sync') {
      setActiveFileTab('cloud');
      return;
    }

    if (history.length > 0) {
      const newHistory = [...history];
      const previousPath = newHistory.pop();
      setHistory(newHistory);
      setCurrentPath(previousPath);
    } else {
      navigation.goBack();
    }
  };

  const handleLongPress = (item) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedFiles([item]);
    }
  };

  const toggleSelection = (item) => {
    const isSelected = selectedFiles.some(f => f.id === item.id);
    if (isSelected) {
      const newSelection = selectedFiles.filter(f => f.id !== item.id);
      setSelectedFiles(newSelection);
      if (newSelection.length === 0) setIsSelectionMode(false);
    } else {
      setSelectedFiles([...selectedFiles, item]);
    }
  };

  const handleFilePress = (item) => {
    if (isSelectionMode) {
      toggleSelection(item);
      return;
    }
    if (item.type === 'folder') {
      setHistory([...history, currentPath]);
      setCurrentPath(`${currentPath}${item.name}/`);
    } else {
      const lowerName = String(item.name || '').toLowerCase();

      if (lowerName.endsWith('.pdf')) {
        navigation.navigate('PdfReaderScreen', {
          document: {
            id: item.id,
            title: item.name,
            uri: item.path,
            size: item.size,
            remotePath: item.remotePath,
            isRemote: item.isRemote,
          },
        });
        return;
      }

      if (lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) {
        navigation.navigate('WordReaderScreen', {
          document: {
            id: item.id,
            title: item.name,
            uri: item.path,
            size: item.size,
            remotePath: item.remotePath,
            isRemote: item.isRemote,
          },
        });
        return;
      }

      if (Platform.OS === 'android' && isApkFile(lowerName)) {
        handleInstallApk(item);
        return;
      }

      Alert.alert('File', `Selected file: ${item.name}`);
    }
  };

  const materializeFileForDevice = async (targetFile, folderName = 'exports') => {
    if (!hasApiContext || !targetFile.remotePath) {
      return targetFile.path;
    }

    const targetDir = `${FileSystem.cacheDirectory}${folderName}/`;
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
    const localTargetPath = `${targetDir}${targetFile.name}`;
    const downloadUrl = fileService.getDownloadUrl({
      userId: currentUser.id,
      deviceId: currentDevice.id,
      path: targetFile.remotePath,
    });

    await FileSystem.downloadAsync(downloadUrl, localTargetPath);
    return localTargetPath;
  };

  const handleAddPress = () => {
    if (activeFileTab !== 'cloud') {
      return;
    }

    Alert.alert('Add New', 'Choose an action', [
      { text: 'Create Folder', onPress: () => {
          setInputType('createFolder');
          setInputValue('');
          setInputModalVisible(true);
        }
      },
      { text: 'Upload File', onPress: handleUploadFile },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ 
        copyToCacheDirectory: true,
        multiple: true 
      });
      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const assetSizes = await Promise.all(result.assets.map(async (asset) => {
          if (typeof asset.size === 'number') return asset.size;
          const info = await FileSystem.getInfoAsync(asset.uri);
          return info.size || 0;
        }));
        const totalIncomingBytes = assetSizes.reduce((sum, size) => sum + size, 0);
        if (!hasApiContext) {
          const storageCheck = await ensureDeviceHasSpace({
            baseDir: getStorageDir() || '',
            device: currentDevice,
            incomingBytes: totalIncomingBytes,
          });

          if (!storageCheck.ok) {
            Alert.alert('Storage full', 'Not enough space on this device. Free up storage before uploading more files.');
            return;
          }
        }

        setIsLoading(true);
        const relativeFolderPath = getRelativeFolderPath(currentPath);
        setUploadState({
          visible: true,
          currentFileName: result.assets[0]?.name || 'Preparing upload',
          completedFiles: 0,
          totalFiles: result.assets.length,
          progress: 0,
        });

        for (let index = 0; index < result.assets.length; index++) {
          const asset = result.assets[index];
          setUploadState((prev) => ({
            ...prev,
            currentFileName: asset.name,
            completedFiles: index,
            progress: prev.totalFiles ? index / prev.totalFiles : 0,
          }));

          if (hasApiContext) {
            await fileService.upload({
              uri: asset.uri,
              name: asset.name,
              mimeType: asset.mimeType,
              userId: currentUser.id,
              deviceId: currentDevice.id,
              folderPath: relativeFolderPath,
              onUploadProgress: (event) => {
                if (!event?.total) return;
                const fileProgress = event.loaded / event.total;
                setUploadState((prev) => ({
                  ...prev,
                  currentFileName: asset.name,
                  completedFiles: index,
                  progress: prev.totalFiles
                    ? Math.min((index + fileProgress) / prev.totalFiles, 1)
                    : fileProgress,
                }));
              },
            });
          } else {
            const newPath = `${currentPath}${asset.name}`;
            await FileSystem.copyAsync({ from: asset.uri, to: newPath });
          }
        }
        setUploadState((prev) => ({
          ...prev,
          completedFiles: prev.totalFiles,
          progress: 1,
        }));
        loadFiles(currentPath);
        Alert.alert('Success', `${result.assets.length} file(s) uploaded successfully`);
      }
    } catch (error) {
      const rawData = error?.response?.data;
      const isHtmlError = typeof rawData === 'string' && /<!doctype html|<html/i.test(rawData);
      const status = error?.response?.status;
      const serverMessage = isHtmlError
        ? `The live server rejected the upload${status ? ` (HTTP ${status})` : ''}. Please upload the latest API package and try again.`
        : rawData?.message || error?.message || 'Failed to upload files';
      console.warn('Failed to upload files:', {
        message: error?.message,
        status,
        serverMessage,
      });
      Alert.alert('Upload failed', serverMessage);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        resetUploadState();
      }, 600);
    }
  };

  const handleCreateFolder = async () => {
    if (!inputValue.trim()) return;
    try {
      if (hasApiContext) {
        const relativeFolderPath = getRelativeFolderPath(currentPath);
        await fileService.createFolder({
          userId: currentUser.id,
          deviceId: currentDevice.id,
          folderPath: relativeFolderPath,
          name: inputValue.trim(),
        });
      } else {
        const folderPath = `${currentPath}${inputValue}/`;
        await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
      }
      loadFiles(currentPath);
      setInputModalVisible(false);
    } catch (error) {
      console.error('Failed to create folder:', {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      const serverMessage = error?.response?.data?.message || error?.message || 'Failed to create folder';
      Alert.alert('Folder failed', serverMessage);
    }
  };

  const handleRename = async () => {
    if (!inputValue.trim() || !selectedFile) return;
    try {
      const newName = inputValue.trim();
      const currentExtension = selectedFile.type === 'file' && selectedFile.name.includes('.')
        ? `.${selectedFile.name.split('.').pop()}`
        : '';
      const finalLocalName = selectedFile.type === 'file' && !newName.includes('.') && currentExtension
        ? `${newName}${currentExtension}`
        : newName;
      const newPath = `${currentPath}${finalLocalName}${selectedFile.type === 'folder' ? '/' : ''}`;

      if (hasApiContext && selectedFile.remotePath) {
        await fileService.rename({
          userId: currentUser.id,
          deviceId: currentDevice.id,
          path: selectedFile.remotePath,
          name: newName,
          type: selectedFile.type,
        });
      } else {
        await FileSystem.moveAsync({ from: selectedFile.path, to: newPath });
      }

      loadFiles(currentPath);
      setInputModalVisible(false);
      setActionModalVisible(false);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to rename');
    }
  };

  const handleDelete = async () => {
    const itemsToDelete = isSelectionMode ? selectedFiles : [selectedFile];
    if (!itemsToDelete || itemsToDelete.length === 0) return;

    const message = isSelectionMode 
      ? `Are you sure you want to delete ${itemsToDelete.length} item(s)?`
      : `Are you sure you want to delete ${selectedFile.name}?`;

    Alert.alert('Delete', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            for (const item of itemsToDelete) {
              if (hasApiContext && item.remotePath) {
                await fileService.delete({
                  userId: currentUser.id,
                  deviceId: currentDevice.id,
                  path: item.remotePath,
                  type: item.type,
                });
              } else {
                await FileSystem.deleteAsync(item.path, { idempotent: true });
              }
            }
            loadFiles(currentPath);
            setActionModalVisible(false);
            if (isSelectionMode) {
              setIsSelectionMode(false);
              setSelectedFiles([]);
            }
          } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to delete some items');
          }
        }
      }
    ]);
  };

  const handlePickerSelect = async () => {
    const itemsToProcess = isSelectionMode ? selectedFiles : [selectedFile];
    if (!itemsToProcess || itemsToProcess.length === 0) return;

    try {
      const destinationFolderPath = getRelativeFolderPath(pickerPath);

      if (!hasApiContext && pickerType === 'copy') {
        let copyBytes = 0;
        for (const item of itemsToProcess) {
          const info = await FileSystem.getInfoAsync(item.path);
          copyBytes += info.size || 0;
        }

        const storageCheck = await ensureDeviceHasSpace({
          baseDir: getStorageDir() || '',
          device: currentDevice,
          incomingBytes: copyBytes,
        });

        if (!storageCheck.ok) {
          Alert.alert('Storage full', 'Not enough space to copy these files on this device.');
          return;
        }
      }

      for (const item of itemsToProcess) {
        const destPath = `${pickerPath}${item.name}`;
        const destPathWithFolder = item.type === 'folder' ? `${destPath}/` : destPath;

        if (hasApiContext && item.remotePath) {
          if (pickerType === 'move') {
            await fileService.move({
              userId: currentUser.id,
              deviceId: currentDevice.id,
              path: item.remotePath,
              type: item.type,
              destinationFolderPath,
            });
          } else if (pickerType === 'copy') {
            await fileService.copy({
              userId: currentUser.id,
              deviceId: currentDevice.id,
              path: item.remotePath,
              type: item.type,
              destinationFolderPath,
            });
          }
        } else if (pickerType === 'move') {
          await FileSystem.moveAsync({ from: item.path, to: destPathWithFolder });
        } else if (pickerType === 'copy') {
          await FileSystem.copyAsync({ from: item.path, to: destPathWithFolder });
        }
      }
      loadFiles(currentPath);
      setPickerModalVisible(false);
      setActionModalVisible(false);
      
      if (isSelectionMode) {
        setIsSelectionMode(false);
        setSelectedFiles([]);
      }
      
      Alert.alert('Success', `Successfully ${pickerType === 'move' ? 'moved' : 'copied'} ${itemsToProcess.length} item(s)`);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', `Failed to ${pickerType} some items`);
    }
  };

  const openPicker = (type) => {
    setPickerType(type);
    setPickerPath(getStorageDir() || '');
    setPickerHistory([]);
    loadPickerFolders(getStorageDir() || '');
    setPickerModalVisible(true);
  };

  const handleExportToPhone = async () => {
    const itemsToExport = isSelectionMode ? selectedFiles : [selectedFile];
    if (!itemsToExport || itemsToExport.length === 0) return;

    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Unavailable', 'Export is not available on this device.');
        return;
      }

      const filesOnly = itemsToExport.filter((item) => item.type !== 'folder');
      if (filesOnly.length === 0) {
        Alert.alert('Unavailable', 'Folders cannot be exported directly. Open the folder and export the files inside it.');
        return;
      }

      if (filesOnly.length > 1) {
        Alert.alert('One file at a time', 'For now, export one file at a time to the main phone.');
        return;
      }

      const targetFile = filesOnly[0];
      const sharePath = await materializeFileForDevice(targetFile, 'exports');

      await Sharing.shareAsync(sharePath, {
        dialogTitle: `Export ${filesOnly[0].name}`,
      });

      setActionModalVisible(false);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to export file to main phone');
    }
  };

  const handleShareToUser = async () => {
    if (!recipientPhone.trim()) {
      Alert.alert('Error', 'Please enter the recipient device phone number.');
      return;
    }

    const itemsToShare = isSelectionMode ? selectedFiles : [selectedFile];
    if (!itemsToShare || itemsToShare.length === 0) return;

    try {
      setIsSharing(true);
      setShareProgress(0.1);

      const localRecipientDevice = resolveLocalRecipientDevice({
        accounts,
        currentUser,
        currentDevice,
        phoneNumber: recipientPhone,
      });

      if (localRecipientDevice?.isCurrentDevice) {
        Alert.alert('Same device', 'Choose another device number, not the current device.');
        setIsSharing(false);
        return;
      }

      // 1. Check if user exists, unless the number belongs to another local device.
      const checkResponse = localRecipientDevice
        ? {
            exists: true,
            id: localRecipientDevice.userId,
            name: localRecipientDevice.name,
            phone_number: localRecipientDevice.phoneNumber,
          }
        : await messageService.checkNumber({ phoneNumber: recipientPhone });
      setShareProgress(0.3);

      if (!checkResponse.exists) {
        Alert.alert('Not found', 'The recipient device phone number does not exist on our records.');
        setIsSharing(false);
        return;
      }

      setShareProgress(0.5);

      // 2. Perform the share
      const shareResponse = await fileService.share({
        userId: currentUser.id,
        deviceId: currentDevice.id,
        recipientPhoneNumber: recipientPhone,
        recipientUserId: localRecipientDevice?.userId,
        recipientDeviceId: localRecipientDevice?.deviceId,
        recipientDeviceStorage: localRecipientDevice?.storage,
        items: itemsToShare.map(item => ({
          path: item.remotePath || item.path,
          type: item.type,
          name: item.name,
        })),
      });

      setShareProgress(1);
      
      setTimeout(() => {
        setIsSharing(false);
        setShareModalVisible(false);
        setRecipientPhone('');
        setIsSelectionMode(false);
        setSelectedFiles([]);
        setActionModalVisible(false);
        Alert.alert('Success', shareResponse.message);
      }, 500);

    } catch (error) {
      console.error('Sharing error:', error);
      setIsSharing(false);
      const message = error?.response?.data?.message || 'Failed to share files. Please try again.';
      Alert.alert('Sharing failed', message);
    }
  };

  const handleInstallApk = async (file = selectedFile) => {
    if (!file) return;

    if (Platform.OS !== 'android') {
      Alert.alert('Unavailable', 'APK installation is only available on Android devices.');
      return;
    }

    if (file.type !== 'file' || !isApkFile(file.name)) {
      Alert.alert('Unavailable', 'Choose an APK file to install.');
      return;
    }

    try {
      const apkPath = await materializeFileForDevice(file, 'apk-installs');
      await installApk(apkPath);
      setActionModalVisible(false);
    } catch (error) {
      Alert.alert(
        'Install failed',
        error?.message || 'Could not open the Android package installer.'
      );
    }
  };

  const switchFileTab = (tab) => {
    setActiveFileTab(tab);
    setIsSelectionMode(false);
    setSelectedFiles([]);
    setActionModalVisible(false);
  };

  const getIconForType = (type, name) => {
    if (type === 'folder') return 'folder';
    if (name.endsWith('.pdf')) return 'document-text';
    if (name.endsWith('.mp3')) return 'musical-note';
    if (name.endsWith('.txt')) return 'document';
    return 'document-outline';
  };

  const getIconColor = (type) => {
    return type === 'folder' ? '#f59e0b' : '#3b82f6';
  };

  const renderFileItem = ({ item }) => {
    const isSelected = selectedFiles.some(f => f.id === item.id);
    
    return (
      <TouchableOpacity 
        style={[styles.fileItem, isSelected && styles.fileItemSelected]} 
        onPress={() => handleFilePress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        {isSelectionMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#ffffff" />}
          </View>
        )}
        <View style={styles.fileIconContainer}>
          <Ionicons name={getIconForType(item.type, item.name)} size={24} color={getIconColor(item.type)} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>{item.type === 'folder' ? 'Folder' : item.size} • {item.date}</Text>
        </View>
        {!isSelectionMode && (
          <TouchableOpacity style={styles.moreBtn} onPress={() => { setSelectedFile(item); setActionModalVisible(true); }}>
            <Ionicons name="ellipsis-vertical" size={20} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {isSelectionMode ? (
        <View style={styles.selectionHeader}>
          <TouchableOpacity onPress={() => { setIsSelectionMode(false); setSelectedFiles([]); }} style={styles.backBtn}>
            <Ionicons name="close" size={28} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedFiles.length} Selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.addBtn} onPress={() => openPicker('move')} disabled={selectedFiles.length === 0}>
              <Ionicons name="move" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => openPicker('copy')} disabled={selectedFiles.length === 0}>
              <Ionicons name="copy" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShareModalVisible(true)} disabled={selectedFiles.length === 0}>
              <Ionicons name="share-social-outline" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={handleExportToPhone} disabled={selectedFiles.length === 0}>
              <Ionicons name="phone-portrait-outline" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={handleDelete} disabled={selectedFiles.length === 0}>
              <Ionicons name="trash" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#ef4444"} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="middle">
            {history.length === 0 ? 'Files' : (currentPath || '').split('/').slice(-2)[0] || 'Folder'}
          </Text>
          {activeFileTab === 'cloud' ? (
            <TouchableOpacity style={styles.addBtn} onPress={handleAddPress}>
              <Ionicons name="add" size={28} color="#0f172a" />
            </TouchableOpacity>
          ) : (
            <View style={styles.addBtnPlaceholder} />
          )}
        </View>
      )}

      <View style={styles.content}>
        {history.length === 0 && (
          <LinearGradient
            colors={['#0f172a', '#1e293b']}
            style={styles.storageCard}
          >
            <View style={styles.storageHeader}>
              <Ionicons name={hasApiContext ? "cloud" : "server"} size={24} color="#38bdf8" />
              <Text style={styles.storageTitle}>{hasApiContext ? 'Cloud Storage' : 'Internal Storage'}</Text>
            </View>
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <LinearGradient
                  colors={['#38bdf8', '#3b82f6']}
                  style={[styles.progressBarFill, { width: `${Math.min((totalStorageSize / MAX_STORAGE_BYTES) * 100, 100)}%` }]}
                />
              </View>
            </View>
            <View style={styles.storageStats}>
              <View>
                <Text style={styles.storageText}>{hasApiContext ? 'Cloud Device' : 'Local Device'}</Text>
              </View>
              <Text style={styles.storageText}>
                {(totalStorageSize / (1024 * 1024)).toFixed(2)} MB / {MAX_STORAGE_MB} MB
              </Text>
            </View>
          </LinearGradient>
        )}

        <View style={styles.fileTabs}>
          <TouchableOpacity
            style={[styles.fileTab, activeFileTab === 'cloud' && styles.fileTabActive]}
            onPress={() => switchFileTab('cloud')}
          >
            <Ionicons
              name={hasApiContext ? 'cloud-outline' : 'folder-outline'}
              size={18}
              color={activeFileTab === 'cloud' ? '#ffffff' : '#64748b'}
            />
            <Text style={[styles.fileTabText, activeFileTab === 'cloud' && styles.fileTabTextActive]}>
              {hasApiContext ? 'Cloud Files' : 'Files'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fileTab, activeFileTab === 'sync' && styles.fileTabActive]}
            onPress={() => switchFileTab('sync')}
          >
            <Ionicons
              name="sync-outline"
              size={18}
              color={activeFileTab === 'sync' ? '#ffffff' : '#64748b'}
            />
            <Text style={[styles.fileTabText, activeFileTab === 'sync' && styles.fileTabTextActive]}>
              Sync Offline
            </Text>
          </TouchableOpacity>
        </View>

        {activeFileTab === 'cloud' ? (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{hasApiContext ? 'Cloud Files' : 'Files'}</Text>
              <TouchableOpacity onPress={() => loadFiles(currentPath)}>
                <Ionicons name="refresh" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={files}
                keyExtractor={item => item.id}
                renderItem={renderFileItem}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={<Text style={styles.emptyText}>No files found</Text>}
              />
            )}
          </>
        ) : (
          <>
            <View style={styles.syncToolbar}>
              <View style={styles.syncToolbarText}>
                <Text style={styles.syncOfflineTitle}>Sync Offline</Text>
                <Text style={styles.syncPathText} numberOfLines={1} ellipsizeMode="middle">
                  {(syncBrowserPath || '').replace(getStorageDir() || '', 'Device files/')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.syncNowButton, isOfflineSyncing && styles.syncNowButtonDisabled]}
                onPress={() => handleRunOfflineSync()}
                disabled={isOfflineSyncing || syncFolders.length === 0}
              >
                {isOfflineSyncing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={18} color="#ffffff" />
                )}
                <Text style={styles.syncNowButtonText}>Sync now</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.syncSummaryCard}>
              <Ionicons name="sync-outline" size={20} color="#2563eb" />
              <Text style={styles.syncSummaryText}>
                {syncFolders.length} folder(s) marked for cloud sync
              </Text>
            </View>

            {syncProgressText ? (
              <Text style={styles.syncProgressText}>{syncProgressText}</Text>
            ) : null}

            {syncBrowserHistory.length > 0 ? (
              <TouchableOpacity style={styles.syncFolderRow} onPress={handleSyncBrowserBack}>
                <Ionicons name="arrow-up-circle-outline" size={24} color="#2563eb" />
                <Text style={styles.syncFolderName}>Back to parent folder</Text>
              </TouchableOpacity>
            ) : null}

            {isSyncBrowserLoading ? (
              <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={syncBrowserFolders}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={<Text style={styles.emptyText}>No folders found</Text>}
                renderItem={({ item }) => {
                  const isMarked = isSyncFolderMarked(item.path);
                  const markedFolder = syncFolders.find((folder) => folder.path === item.path);

                  return (
                    <View style={[styles.syncFolderRow, isMarked && styles.syncFolderRowMarked]}>
                      <TouchableOpacity
                        style={styles.syncFolderBrowse}
                        onPress={() => handleBrowseSyncFolder(item.path)}
                      >
                        <Ionicons name="folder" size={26} color="#f59e0b" />
                        <View style={styles.syncFolderInfo}>
                          <Text style={styles.syncFolderName}>{item.name}</Text>
                          <Text style={styles.syncFolderMeta}>
                            {isMarked ? `Marked - ${markedFolder?.status || 'queued'}` : 'Tap folder name to browse'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.syncMarkButton, isMarked && styles.syncMarkButtonActive]}
                        onPress={() => handleToggleSyncFolder(item)}
                      >
                        <Ionicons
                          name={isMarked ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={isMarked ? '#ffffff' : '#2563eb'}
                        />
                        <Text style={[styles.syncMarkButtonText, isMarked && styles.syncMarkButtonTextActive]}>
                          {isMarked ? 'Marked' : 'Mark'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </>
        )}
      </View>

      <Modal visible={uploadState.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.uploadModalContent}>
            <View style={styles.uploadHeader}>
              <Ionicons name="cloud-upload-outline" size={28} color="#2563eb" />
              <Text style={styles.uploadTitle}>Uploading Files</Text>
            </View>
            <Text style={styles.uploadSubtitle} numberOfLines={1}>
              {uploadState.currentFileName || 'Preparing upload...'}
            </Text>
            <View style={styles.uploadProgressTrack}>
              <View
                style={[
                  styles.uploadProgressFill,
                  { width: `${Math.max(uploadState.progress * 100, 6)}%` },
                ]}
              />
            </View>
            <View style={styles.uploadMetaRow}>
              <Text style={styles.uploadMetaText}>
                {Math.round(uploadState.progress * 100)}%
              </Text>
              <Text style={styles.uploadMetaText}>
                {uploadState.completedFiles} of {uploadState.totalFiles} file(s)
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Input Modal */}
      <Modal visible={inputModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.inputModalContent}>
            <Text style={styles.modalTitle}>{inputType === 'createFolder' ? 'Create Folder' : 'Rename'}</Text>
            <TextInput
              style={styles.textInput}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={inputType === 'createFolder' ? 'Folder Name' : 'New Name'}
              placeholderTextColor="#64748b"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setInputModalVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={inputType === 'createFolder' ? handleCreateFolder : handleRename}>
                <Text style={styles.modalBtnTextLight}>{inputType === 'createFolder' ? 'Create' : 'Rename'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Modal */}
      <Modal visible={actionModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActionModalVisible(false)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{selectedFile?.name}</Text>
            <TouchableOpacity style={styles.actionItem} onPress={() => { setInputType('rename'); setInputValue(selectedFile?.name || ''); setInputModalVisible(true); }}>
              <Ionicons name="pencil" size={24} color="#0f172a" />
              <Text style={styles.actionText}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => openPicker('move')}>
              <Ionicons name="move" size={24} color="#0f172a" />
              <Text style={styles.actionText}>Move</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => openPicker('copy')}>
              <Ionicons name="copy" size={24} color="#0f172a" />
              <Text style={styles.actionText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => setShareModalVisible(true)}>
              <Ionicons name="share-social-outline" size={24} color="#0f172a" />
              <Text style={styles.actionText}>Share to Device</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleExportToPhone}>
              <Ionicons name="phone-portrait-outline" size={24} color="#0f172a" />
              <Text style={styles.actionText}>Export to Main Phone</Text>
            </TouchableOpacity>
            {selectedFile?.type === 'file' && isApkFile(selectedFile?.name || '') ? (
              <TouchableOpacity style={styles.actionItem} onPress={() => handleInstallApk(selectedFile)}>
                <Ionicons name="download-outline" size={24} color="#0f172a" />
                <Text style={styles.actionText}>Install APK</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.actionItem, { borderBottomWidth: 0 }]} onPress={handleDelete}>
              <Ionicons name="trash" size={24} color="#ef4444" />
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.inputModalContent}>
            <Text style={styles.modalTitle}>Share to Device</Text>
            <Text style={styles.modalSubtitle}>Enter the recipient's phone number</Text>
            <TextInput
              style={styles.textInput}
              value={recipientPhone}
              onChangeText={setRecipientPhone}
              placeholder="e.g. 08012345678"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
              autoFocus
              editable={!isSharing}
            />
            
            {isSharing && (
              <View style={styles.shareProgressContainer}>
                <View style={styles.shareProgressBarBg}>
                  <View style={[styles.shareProgressBarFill, { width: `${shareProgress * 100}%` }]} />
                </View>
                <Text style={styles.shareProgressText}>Sharing... {Math.round(shareProgress * 100)}%</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalBtn} 
                onPress={() => { setShareModalVisible(false); setRecipientPhone(''); setIsSharing(false); }}
                disabled={isSharing}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnPrimary, isSharing && styles.modalBtnDisabled]} 
                onPress={handleShareToUser}
                disabled={isSharing}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalBtnTextLight}>Share</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Folder Picker Modal */}
      <Modal visible={pickerModalVisible} animationType="slide">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => {
              if (pickerHistory.length > 0) {
                const newHistory = [...pickerHistory];
                const previousPath = newHistory.pop();
                setPickerHistory(newHistory);
                setPickerPath(previousPath);
                loadPickerFolders(previousPath);
              } else {
                setPickerModalVisible(false);
              }
            }} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={28} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Select Destination</Text>
            <TouchableOpacity onPress={() => setPickerModalVisible(false)} style={styles.addBtn}>
              <Ionicons name="close" size={28} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <View style={styles.pickerCurrentPath}>
            <Text style={styles.pickerPathText}>{pickerPath ? pickerPath.replace(getStorageDir() || '', 'Documents/') : 'Documents/'}</Text>
          </View>
          <FlatList
            data={pickerFolders}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.folderItem} onPress={() => {
                setPickerHistory([...pickerHistory, pickerPath]);
                const newPath = `${pickerPath}${item.name}/`;
                setPickerPath(newPath);
                loadPickerFolders(newPath);
              }}>
                <Ionicons name="folder" size={24} color="#f59e0b" />
                <Text style={styles.folderItemText}>{item.name}</Text>
                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No folders here</Text>}
          />
          <View style={styles.pickerFooter}>
            <TouchableOpacity style={styles.pickerActionBtn} onPress={handlePickerSelect}>
              <Text style={styles.pickerActionText}>{pickerType === 'move' ? 'Move Here' : 'Copy Here'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Bottom Navigation Bar */}
      {osType !== 'ios' && (
        <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('RecentAppsScreen')}>
                  <Ionicons name="menu" size={24} color="#64748b" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('DesktopScreen')}>
                  <Ionicons name="radio-button-off" size={24} color="#64748b" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.goBack()}>
                  <Ionicons name="chevron-back" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#f1f5f9',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  addBtn: {
    padding: 4,
  },
  addBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    maxWidth: '60%',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  storageCard: {
    padding: 20,
    borderRadius: 24,
    marginTop: 10,
    marginBottom: 24,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  storageTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  storageStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  fileTabs: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  fileTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fileTabActive: {
    backgroundColor: '#2563eb',
  },
  fileTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  fileTabTextActive: {
    color: '#ffffff',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listContainer: {
    paddingBottom: 40,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fileItemSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#f0f9ff',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  fileMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  moreBtn: {
    padding: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 40,
    fontSize: 16,
  },
  syncToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  syncToolbarText: {
    flex: 1,
  },
  syncOfflineTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  syncPathText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  syncNowButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  syncNowButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  syncNowButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  syncSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  syncSummaryText: {
    color: '#1e3a8a',
    fontSize: 13,
    fontWeight: '700',
  },
  syncProgressText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  syncFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  syncFolderRowMarked: {
    borderColor: '#2563eb',
    backgroundColor: '#f8fbff',
  },
  syncFolderBrowse: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  syncFolderInfo: {
    flex: 1,
  },
  syncFolderName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  syncFolderMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
    textTransform: 'capitalize',
  },
  syncMarkButton: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  syncMarkButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  syncMarkButtonText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
  },
  syncMarkButtonTextActive: {
    color: '#ffffff',
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
  },
  uploadModalContent: {
    width: '84%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
  },
  uploadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  uploadSubtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 18,
  },
  uploadProgressTrack: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  uploadProgressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 999,
  },
  uploadMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  uploadMetaText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  shareProgressContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  shareProgressBarBg: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  shareProgressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  shareProgressText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  actionSheet: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 12,
  },
  modalBtnPrimary: {
    backgroundColor: '#3b82f6',
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
  modalBtnText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  modalBtnTextLight: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  actionText: {
    fontSize: 16,
    color: '#0f172a',
    marginLeft: 16,
  },
  pickerCurrentPath: {
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  pickerPathText: {
    fontSize: 14,
    color: '#475569',
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  folderItemText: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    marginLeft: 16,
  },
  pickerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  pickerActionBtn: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  pickerActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
