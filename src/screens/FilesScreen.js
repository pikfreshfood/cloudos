import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, TextInput, Alert, ActivityIndicator, Platform, PermissionsAndroid, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer } from 'expo-audio';
import { createVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { useMusicPlayer } from '../context/MusicPlayerContext';
import * as DocumentPicker from 'expo-document-picker';
import { DEFAULT_DEVICE_STORAGE_MB, ensureDeviceHasSpace, getDeviceStorageLimitBytes, getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { resolveLocalRecipientDevice } from '../utils/recipientDevice';
import { API_URL, fileService, messageService } from '../services/api';
import { installApk } from '../native/apkInstaller';
import {
  OfflineSyncStorageFullError,
  addOfflineSyncFolder,
  enableOfflineSyncFolders,
  getDeviceSyncFolders,
  readOfflineSyncState,
  registerOfflineSyncTaskAsync,
  removeOfflineSyncFolder,
  runOfflineFolderSync,
  stopOfflineSync,
  safFolderName,
} from '../utils/offlineFolderSync';

const SAF = FileSystem.StorageAccessFramework || null;

export default function FilesScreen({ navigation }) {
  const { getStorageDir, getStorageRoot, osType, currentDevice } = useOS();
  const { accounts, currentUser } = useAuth();
  const {
    currentTrack: musicCurrentTrack,
    isPlaying: isMusicPlaying,
    togglePlayPause: toggleMusicPlayPause,
  } = useMusicPlayer();
  const [currentPath, setCurrentPath] = useState('');
  const [history, setHistory] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFileTab, setActiveFileTab] = useState('cloud');
  const [syncFolders, setSyncFolders] = useState([]);
  const [syncBrowserPath, setSyncBrowserPath] = useState('');
  const [syncBrowserHistory, setSyncBrowserHistory] = useState([]);
  const [syncBrowserFolders, setSyncBrowserFolders] = useState([]);
  const [isSyncBrowserLoading, setIsSyncBrowserLoading] = useState(false);
  const [isOfflineSyncing, setIsOfflineSyncing] = useState(false);
  const [isOfflineSyncActive, setIsOfflineSyncActive] = useState(false);
  const [syncProgressText, setSyncProgressText] = useState('');
  const [isSyncStopConfirmVisible, setIsSyncStopConfirmVisible] = useState(false);
  const [isSyncBrowserVisible, setIsSyncBrowserVisible] = useState(false);


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
  const [mediaPreview, setMediaPreview] = useState(null);
  const [isPreviewAudioPlaying, setIsPreviewAudioPlaying] = useState(false);
  const audioPreviewPlayerRef = useRef(null);
  const resumeMusicAfterPreviewRef = useRef(false);
  const latestMusicStateRef = useRef({ isPlaying: false, currentTrack: null });
  const videoPreviewPlayer = useMemo(() => createVideoPlayer(null), []);
  const MAX_STORAGE_BYTES = getDeviceStorageLimitBytes(currentDevice);
  const MAX_STORAGE_MB = Math.round(MAX_STORAGE_BYTES / (1024 * 1024));
  const hasApiContext = !!currentUser?.id && !!currentDevice?.id;
  const isApkFile = (name = '') => name.toLowerCase().endsWith('.apk');
  const getFileExtension = (name = '') => String(name).split('.').pop()?.toLowerCase() || '';
  const isImageFile = (name = '') => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getFileExtension(name));
  const isAudioFile = (name = '') => ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(getFileExtension(name));
  const isVideoFile = (name = '') => ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(getFileExtension(name));
  const isMediaFile = (name = '') => isImageFile(name) || isAudioFile(name) || isVideoFile(name);

  useEffect(() => () => {
    try {
      audioPreviewPlayerRef.current?.release?.();
      videoPreviewPlayer.release();
    } catch {}
  }, [videoPreviewPlayer]);

  useEffect(() => {
    latestMusicStateRef.current = {
      isPlaying: isMusicPlaying,
      currentTrack: musicCurrentTrack,
    };
  }, [isMusicPlaying, musicCurrentTrack]);

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

      const baseDir = currentDevice?.id ? (getStorageDir() || '') : (getStorageRoot() || '');
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
    let baseDir = '';
    if (currentDevice?.id) {
      baseDir = getStorageDir() || '';
    } else if (Platform.OS === 'ios') {
      baseDir = getStorageRoot() || '';
    }
    setCurrentPath(baseDir);
    setPickerPath(baseDir);
    setSyncBrowserPath('');
    setHistory([]);
    setPickerHistory([]);
    setSyncBrowserHistory([]);
  }, [currentDevice?.id]);

  useEffect(() => {
    if (activeFileTab !== 'sync') return;

    refreshOfflineSyncFolders();
    registerOfflineSyncTaskAsync();
  }, [activeFileTab, currentUser?.id, currentDevice?.id]);

  const isSAFUri = (path) => {
    return typeof path === 'string' && path.startsWith('content://');
  };

  const extractNameFromSAFUri = (uri) => {
    try {
      const decoded = decodeURIComponent(String(uri || '')).replace(/\/+$/g, '');
      const lastPathPart = decoded.split('/').filter(Boolean).pop() || '';
      const storagePart = lastPathPart.includes(':') ? lastPathPart.split(':').pop() : lastPathPart;
      return storagePart || 'Selected folder';
    } catch {
      return 'Selected folder';
    }
  };

  const normalizeSAFDirectoryUri = (uri = '') => (
    uri ? `${String(uri).replace(/\/+$/g, '')}/` : ''
  );

  const normalizeDirectoryPath = (path = '') => (
    isSAFUri(path) ? normalizeSAFDirectoryUri(path) : path
  );

  const getFolderDisplayName = (path = '') => (
    isSAFUri(path) ? extractNameFromSAFUri(path) : safFolderName(path)
  );

  const getSAFItemInfo = async (uri) => {
    try {
      return await FileSystem.getInfoAsync(uri);
    } catch {
      try {
        await SAF.readDirectoryAsync(uri);
        return { exists: true, isDirectory: true, size: 0, modificationTime: null };
      } catch {
        return { exists: false, isDirectory: false, size: 0, modificationTime: null };
      }
    }
  };

  const getAndroidMainStorageUri = () => {
    try {
      return SAF?.getUriForDirectoryInRoot ? SAF.getUriForDirectoryInRoot('') : null;
    } catch {
      return null;
    }
  };

  const requestStoragePermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission',
          message: 'Cloud OS needs access to your storage to browse files like a file manager.',
          buttonPositive: 'Grant',
          buttonNegative: 'Deny',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const loadFilesFromLocal = async (path) => {
    if (!path) {
      if (!hasApiContext) {
        path = getStorageRoot() || '';
      } else {
        path = getStorageDir() || '';
      }
      setCurrentPath(path);
      if (!path) {
        setIsLoading(false);
        setFiles([]);
        return;
      }
    }
    try {
      setIsLoading(true);

      if (isSAFUri(path) && SAF) {
        await loadFilesFromSAF(path);
        return;
      }

      const items = await FileSystem.readDirectoryAsync(path);
      
      // Filter out hidden files/folders (starting with dot) and specific system folders
      const visibleItems = items.filter(item => !item.startsWith('.'));
      
      const fileList = await Promise.all(
        visibleItems.map(async (item) => {
          const separator = path.endsWith('/') ? '' : '/';
          const itemPath = `${path}${separator}${item}`;
          const info = await FileSystem.getInfoAsync(itemPath);
          return {
            id: item,
            name: item,
            type: info.isDirectory ? 'folder' : 'file',
            size: info.size ? `${(info.size / 1024).toFixed(2)} KB` : '',
            date: info.modificationTime
              ? new Date(info.modificationTime * 1000).toLocaleDateString()
              : '',
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
      console.error('Failed to load files from local storage:', error?.message || error);

      if (Platform.OS === 'android') {
        const hasPermission = await requestStoragePermission();
        if (hasPermission) {
          try {
            const items = await FileSystem.readDirectoryAsync(path);
            const visibleItems = items.filter(item => !item.startsWith('.'));
            const fileList = await Promise.all(
              visibleItems.map(async (item) => {
                const separator = path.endsWith('/') ? '' : '/';
                const itemPath = `${path}${separator}${item}`;
                const info = await FileSystem.getInfoAsync(itemPath);
                return {
                  id: item,
                  name: item,
                  type: info.isDirectory ? 'folder' : 'file',
                  size: info.size ? `${(info.size / 1024).toFixed(2)} KB` : '',
                  date: info.modificationTime
                    ? new Date(info.modificationTime * 1000).toLocaleDateString()
                    : '',
                  path: itemPath,
                  remotePath: null,
                  isRemote: false,
                };
              })
            );
            fileList.sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'folder' ? -1 : 1;
            });
            setFiles(fileList);
            calculateTotalStorage();
          } catch (retryError) {
            console.error('Still failed after permission grant:', retryError?.message || retryError);
            setFiles([]);
            Alert.alert(
              'Storage Access',
              'Cannot access device storage. Try using "Browse Storage" option to pick a folder.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Browse Storage', onPress: handleBrowseDeviceStorage },
              ]
            );
          }
        } else {
          setFiles([]);
          Alert.alert(
            'Permission Denied',
            'Storage permission is needed to browse files. You can use "Browse Storage" to pick a folder manually.',
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Browse Storage', onPress: handleBrowseDeviceStorage },
            ]
          );
        }
      } else {
        setFiles([]);
        Alert.alert('Error', 'Failed to load files from this location.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadFilesFromSAF = async (safUri) => {
    try {
      const childUris = await SAF.readDirectoryAsync(safUri);
      const fileList = [];

      for (const uri of childUris) {
        try {
          const info = await getSAFItemInfo(uri);
          if (!info.exists) continue;
          const name = extractNameFromSAFUri(uri);
          if (name.startsWith('.')) continue;
          fileList.push({
            id: uri,
            name,
            type: info.isDirectory ? 'folder' : 'file',
            size: info.size ? `${(info.size / 1024).toFixed(2)} KB` : '',
            date: info.modificationTime
              ? new Date(info.modificationTime * 1000).toLocaleDateString()
              : '',
            path: uri,
            remotePath: null,
            isRemote: false,
          });
        } catch (itemError) {
          console.warn('Skipping inaccessible item:', uri, itemError?.message);
        }
      }

      fileList.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      });
      setFiles(fileList);
      calculateTotalStorage();
    } catch (error) {
      console.error('SAF read error:', error?.message || error);
      setFiles([]);
      Alert.alert('Error', 'Failed to browse storage. Try selecting a different folder.');
    }
  };

  const handleBrowseDeviceStorage = async () => {
    if (Platform.OS === 'android' && SAF) {
      try {
        const permission = await SAF.requestDirectoryPermissionsAsync();
        if (permission.granted && permission.directoryUri) {
          const uri = permission.directoryUri.replace(/\/+$/g, '') + '/';
          setHistory([]);
          setCurrentPath(uri);
        }
      } catch (error) {
        console.error('SAF picker error:', error);
        Alert.alert('Error', 'Could not open storage browser.');
      }
    } else {
      Alert.alert('Unavailable', 'Storage browsing is not available on this platform.');
    }
  };

  const loadFiles = async (path) => {
    if (!path) {
      if (!hasApiContext) {
        if (Platform.OS === 'android' && !isSAFUri(path)) {
          setCurrentPath('');
          setIsLoading(false);
          setFiles([]);
          return;
        }
        path = getStorageRoot() || '';
      } else {
        path = getStorageDir() || '';
      }
      setCurrentPath(path);
      if (!path) {
        setIsLoading(false);
        setFiles([]);
        return;
      }
    }

    if (!hasApiContext) {
      console.log('Loading files from local storage:', path);
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
      if (!hasApiContext) {
        path = getStorageRoot() || '';
      } else {
        path = getStorageDir() || '';
      }
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
      if (isSAFUri(path) && SAF) {
        const childUris = await SAF.readDirectoryAsync(path);
        const folderList = [];
        for (const uri of childUris) {
          try {
            const info = await getSAFItemInfo(uri);
            const name = extractNameFromSAFUri(uri);
            if (info.isDirectory && !name.startsWith('.')) {
              folderList.push({
                id: uri,
                name,
                path: uri,
                remotePath: null,
              });
            }
          } catch (itemError) {
            console.warn('Skipping SAF item in picker:', itemError?.message);
          }
        }
        folderList.sort((a, b) => a.name.localeCompare(b.name));
        setPickerFolders(folderList);
      } else {
        const items = await FileSystem.readDirectoryAsync(path);
        const visibleItems = items.filter(item => !item.startsWith('.'));

        const folderList = [];
        for (const item of visibleItems) {
          const separator = path.endsWith('/') ? '' : '/';
          const itemPath = `${path}${separator}${item}`;
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
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadSyncBrowserFolders = async (path) => {
    const baseDir = currentDevice?.id
      ? (getStorageDir() || '')
      : (getStorageRoot() || '');
    const nextPath = path || baseDir;

    if (!nextPath) {
      setSyncBrowserFolders([]);
      return;
    }

    try {
      setIsSyncBrowserLoading(true);

      if (isSAFUri(nextPath) && SAF) {
        const childUris = await SAF.readDirectoryAsync(nextPath);
        const folders = [];
        for (const uri of childUris) {
          try {
            const info = await getSAFItemInfo(uri);
            const name = extractNameFromSAFUri(uri);
            if (info.isDirectory && !name.startsWith('.')) {
              folders.push({
                id: uri,
                name,
                path: uri,
              });
            }
          } catch (itemError) {
            console.warn('Skipping SAF item in sync browser:', itemError?.message);
          }
        }
        folders.sort((a, b) => a.name.localeCompare(b.name));
        setSyncBrowserFolders(folders);
      } else {
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
      }
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
      setIsOfflineSyncActive(false);
      return;
    }

    const state = await readOfflineSyncState();
    const folders = await getDeviceSyncFolders({
      userId: currentUser.id,
      deviceId: currentDevice.id,
    });
    setSyncFolders(folders);
    setIsOfflineSyncActive(!!state.syncActive && folders.some((folder) => folder.enabled));
  };

  const isSyncFolderMarked = (folderPath) => {
    const normalizedPath = normalizeDirectoryPath(folderPath);
    return syncFolders.some((folder) => normalizeDirectoryPath(folder.path) === normalizedPath);
  };

  const handleBrowseSyncFolder = (folderPath) => {
    setSyncBrowserHistory((current) => [...current, syncBrowserPath || '']);
    setSyncBrowserPath(folderPath);
    loadSyncBrowserFolders(folderPath);
  };

  const handleSyncBrowserBack = () => {
    if (syncBrowserHistory.length === 0) return;

    const nextHistory = [...syncBrowserHistory];
    const previousPath = nextHistory.pop();
    setSyncBrowserHistory(nextHistory);
    const fallback = currentDevice?.id ? (getStorageDir() || '') : (getStorageRoot() || '');
    const nextPath = previousPath || fallback;
    setSyncBrowserPath(nextPath);
    loadSyncBrowserFolders(nextPath);
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

    await addOfflineSyncFolder({
      folderPath: folder.path,
      baseDir: getStorageDir() || '',
      userId: currentUser.id,
      deviceId: currentDevice.id,
      storageMb: currentDevice.storage || DEFAULT_DEVICE_STORAGE_MB,
    });

    await refreshOfflineSyncFolders();
  };

  const handleSelectSyncFolder = async (folder) => {
    if (!hasApiContext) {
      Alert.alert('Cloud account required', 'Sign in with a Cloud OS account and select a cloud device before enabling offline sync.');
      return;
    }

    try {
      const isExternalFolder = isSAFUri(folder.path);
      const folderPath = normalizeDirectoryPath(folder.path);
      const folderName = folder.name || getFolderDisplayName(folderPath);

      try {
        await fileService.createSyncFolderStructure({
          userId: currentUser.id,
          deviceId: currentDevice.id,
          folderPath: folderName,
        });
      } catch (err) {
        console.log('Folder structure creation skipped:', err?.message);
      }

      await addOfflineSyncFolder({
        folderPath,
        baseDir: isExternalFolder ? folderPath : (getStorageDir() || ''),
        userId: currentUser.id,
        deviceId: currentDevice.id,
        storageMb: currentDevice.storage || DEFAULT_DEVICE_STORAGE_MB,
        isExternal: isExternalFolder,
      });

      await refreshOfflineSyncFolders();
      setIsSyncBrowserVisible(false);
      setSyncProgressText(`Added ${folderName} for sync.`);
    } catch (error) {
      Alert.alert('Error', 'Could not add folder for sync.');
    }
  };

  const handleStorageFullAlert = () => {
    Alert.alert(
      'Cloud storage full',
      'Sync is still active, but uploads will retry in the background after storage is available. Upgrade storage to continue uploading.',
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
      setIsOfflineSyncActive(true);
      setSyncProgressText('Preparing offline sync...');
      await enableOfflineSyncFolders({ folderIds });
      await registerOfflineSyncTaskAsync();
      await refreshOfflineSyncFolders();

      const foldersToSync = folderIds
        ? syncFolders.filter((f) => folderIds.includes(f.id))
        : syncFolders;
      for (const folder of foldersToSync) {
        try {
          await fileService.createSyncFolderStructure({
            userId: currentUser.id,
            deviceId: currentDevice.id,
            folderPath: folder.name,
          });
        } catch (err) {
          console.log('Folder structure creation skipped:', err?.message);
        }
      }
      const runSyncPass = async () => {
        const result = await runOfflineFolderSync({
          folderIds,
          onProgress: ({ file }) => {
            setSyncProgressText(`Syncing ${file.name}`);
          },
        });

        await refreshOfflineSyncFolders();
        await loadFiles(currentPath);
        if (result.storageFull) {
          const message = 'Cloud storage is full. Folder sync remains active and will retry in the background.';
          setSyncProgressText(message);
          handleStorageFullAlert();
        } else if (result.failedFiles > 0 || result.failedFolders > 0) {
          const failedParts = [
            result.failedFiles > 0 ? `${result.failedFiles} file(s)` : null,
            result.failedFolders > 0 ? `${result.failedFolders} folder(s)` : null,
          ].filter(Boolean).join(' and ');
          const reason = result.lastError ? ` Last error: ${result.lastError}` : '';
          const message = `${failedParts} failed to sync. ${result.uploadedFiles} file(s) uploaded. Background sync remains active.${reason}`;
          setSyncProgressText(message);
          Alert.alert('Sync incomplete', message);
        } else {
          setSyncProgressText(result.uploadedFiles > 0
            ? `${result.uploadedFiles} file(s) synced. Background sync remains active.`
            : 'Everything is up to date. Background sync remains active.');
        }
      };

      setSyncProgressText('Folder sync is active in background');
      runSyncPass()
        .catch(async (error) => {
          await refreshOfflineSyncFolders();

          if (error instanceof OfflineSyncStorageFullError || error?.code === 'STORAGE_FULL') {
            setSyncProgressText('Cloud storage full. Background sync will keep retrying.');
            handleStorageFullAlert();
          } else {
            setSyncProgressText(error?.message || 'Sync failed.');
            Alert.alert('Sync failed', error?.message || 'Could not sync offline folders right now.');
          }
        })
        .finally(() => {
          setIsOfflineSyncing(false);
        });
    } catch (error) {
      await refreshOfflineSyncFolders();

      if (error instanceof OfflineSyncStorageFullError || error?.code === 'STORAGE_FULL') {
        setSyncProgressText('Cloud storage full. Background sync will keep retrying.');
        handleStorageFullAlert();
      } else {
        setSyncProgressText(error?.message || 'Sync failed.');
        Alert.alert('Sync failed', error?.message || 'Could not sync offline folders right now.');
      }
      setIsOfflineSyncing(false);
    }
  };

  const handleStopOfflineSync = () => {
    setIsSyncStopConfirmVisible(true);
  };

  const confirmStopOfflineSync = async () => {
    try {
      setIsSyncStopConfirmVisible(false);
      setSyncProgressText('Stopping sync...');
      await stopOfflineSync();
      await refreshOfflineSyncFolders();
      setIsOfflineSyncActive(false);
      setSyncProgressText('Sync stopped.');
    } catch (error) {
      setSyncProgressText('Failed to stop sync.');
    }
  };
  const handleAddFolderFromDevice = async () => {
    if (!hasApiContext) {
      Alert.alert('Cloud account required', 'Sign in with a Cloud OS account first.');
      return;
    }

    if (Platform.OS === 'android' && SAF) {
      try {
        const permission = await SAF.requestDirectoryPermissionsAsync(getAndroidMainStorageUri());
        if (!permission.granted || !permission.directoryUri) return;

        const selectedPath = normalizeSAFDirectoryUri(permission.directoryUri);
        await handleSelectSyncFolder({
          id: selectedPath,
          name: getFolderDisplayName(selectedPath),
          path: selectedPath,
        });
      } catch (error) {
        console.log('SAF picker error:', error);
        Alert.alert('Error', 'Could not add the selected folder for sync.');
      }
    } else {
      Alert.alert('Unavailable', 'Native folder picking is only available on Android in this app.');
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

  const resolveMediaPreviewUri = (item) => {
    if (hasApiContext && item.remotePath) {
      return fileService.getDownloadUrl({
        userId: currentUser.id,
        deviceId: currentDevice.id,
        path: item.remotePath,
      });
    }

    return item.path;
  };

  const resumeMusicIfPreviewInterrupted = async () => {
    if (!resumeMusicAfterPreviewRef.current) return;

    resumeMusicAfterPreviewRef.current = false;
    const latestMusicState = latestMusicStateRef.current;

    if (latestMusicState.currentTrack && !latestMusicState.isPlaying) {
      try {
        await toggleMusicPlayPause();
      } catch (error) {
        console.log('Failed to resume music after media preview:', error?.message || error);
      }
    }
  };

  const closeMediaPreview = () => {
    try {
      audioPreviewPlayerRef.current?.pause?.();
      audioPreviewPlayerRef.current?.release?.();
      audioPreviewPlayerRef.current = null;
      videoPreviewPlayer.pause();
    } catch {}

    setIsPreviewAudioPlaying(false);
    setMediaPreview(null);
    setTimeout(() => {
      resumeMusicIfPreviewInterrupted().catch(() => {});
    }, 250);
  };

  const openMediaPreview = async (item) => {
    const uri = resolveMediaPreviewUri(item);
    const kind = isImageFile(item.name) ? 'image' : (isVideoFile(item.name) ? 'video' : 'audio');

    const shouldResumeMusic = kind !== 'image' && !!latestMusicStateRef.current.isPlaying;
    resumeMusicAfterPreviewRef.current = shouldResumeMusic;
    setMediaPreview({ item, uri, kind });
    setIsPreviewAudioPlaying(false);

    try {
      if (shouldResumeMusic) {
        await toggleMusicPlayPause();
      }

      if (kind === 'video') {
        audioPreviewPlayerRef.current?.pause?.();
        videoPreviewPlayer.loop = false;
        videoPreviewPlayer.replace(uri);
        videoPreviewPlayer.play();
        return;
      }

      videoPreviewPlayer.pause();

      if (kind === 'audio') {
        audioPreviewPlayerRef.current?.release?.();
        const nextPlayer = createAudioPlayer(null);
        nextPlayer.replace(uri);
        audioPreviewPlayerRef.current = nextPlayer;
        nextPlayer.play();
        setIsPreviewAudioPlaying(true);
      }
    } catch (error) {
      Alert.alert('Preview unavailable', 'This media file could not be previewed.');
    }
  };

  const toggleAudioPreview = () => {
    const player = audioPreviewPlayerRef.current;
    if (!player) return;

    if (isPreviewAudioPlaying) {
      player.pause();
      setIsPreviewAudioPlaying(false);
    } else {
      player.play();
      setIsPreviewAudioPlaying(true);
    }
  };

  const handleFilePress = (item) => {
    if (isSelectionMode) {
      toggleSelection(item);
      return;
    }
    if (item.type === 'folder') {
      setHistory([...history, currentPath]);
      if (isSAFUri(currentPath)) {
        setCurrentPath(item.path);
      } else {
        const separator = currentPath.endsWith('/') ? '' : '/';
        setCurrentPath(`${currentPath}${separator}${item.name}/`);
      }
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

      if (isMediaFile(lowerName)) {
        openMediaPreview(item);
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
          } else if (isSAFUri(currentPath) && SAF) {
            const assetContent = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const createdUri = await SAF.createFileAsync(
              currentPath,
              asset.name,
              asset.mimeType || 'application/octet-stream'
            );
            await SAF.writeAsStringAsync(createdUri, assetContent, {
              encoding: FileSystem.EncodingType.Base64,
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
      } else if (isSAFUri(currentPath) && SAF) {
        await SAF.makeDirectoryAsync(currentPath, inputValue.trim());
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
      } else if (isSAFUri(selectedFile.path)) {
        Alert.alert('Unavailable', 'Renaming is not available for folders selected via Storage Access.');
        return;
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
              } else if (isSAFUri(item.path) && SAF) {
                await SAF.deleteAsync(item.path);
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
        const isSAFDestination = isSAFUri(pickerPath) && SAF;
        const destPath = isSAFDestination ? item.path : `${pickerPath}${item.name}`;
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
        } else if (isSAFDestination) {
          if (pickerType === 'move') {
            await SAF.moveAsync({ from: item.path, to: pickerPath });
          } else if (pickerType === 'copy') {
            await SAF.copyAsync({ from: item.path, to: pickerPath });
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
    const initialPath = !hasApiContext && isSAFUri(currentPath)
      ? currentPath
      : (getStorageDir() || '');
    setPickerPath(initialPath);
    setPickerHistory([]);
    loadPickerFolders(initialPath);
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
              <Ionicons name="cut-outline" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => openPicker('copy')} disabled={selectedFiles.length === 0}>
              <Ionicons name="copy" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShareModalVisible(true)} disabled={selectedFiles.length === 0}>
              <Ionicons name="share-social-outline" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={handleExportToPhone} disabled={selectedFiles.length === 0}>
              <Ionicons name="share-outline" size={24} color={selectedFiles.length === 0 ? "#cbd5e1" : "#0f172a"} />
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
            {history.length === 0
              ? (hasApiContext ? 'Files' : 'Device Storage')
              : (currentPath || '').split('/').slice(-2)[0] || 'Folder'}
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
            {!hasApiContext && currentPath ? (
              <View style={styles.pathIndicator}>
                <Ionicons name="folder-open" size={14} color="#64748b" />
                <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="middle">
                  {currentPath}
                </Text>
              </View>
            ) : null}
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{hasApiContext ? 'Cloud Files' : 'Device Storage'}</Text>
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
                ListEmptyComponent={
                  !hasApiContext ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
                      <Text style={styles.emptyText}>No files found</Text>
                      <TouchableOpacity style={styles.browseStorageBtn} onPress={handleBrowseDeviceStorage}>
                        <Ionicons name="search" size={18} color="#ffffff" />
                        <Text style={styles.browseStorageBtnText}>Browse Device Storage</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>No files found</Text>
                  )
                }
              />
            )}
          </>
        ) : (
          <>
            <View style={styles.syncToolbar}>
              <View style={styles.syncToolbarText}>
                <Text style={styles.syncOfflineTitle}>Sync Offline</Text>
                <Text style={styles.syncPathText} numberOfLines={1} ellipsizeMode="middle">
                  {syncFolders.length} folder(s) marked
                </Text>
              </View>
              <View style={styles.syncToolbarActions}>
                {isOfflineSyncActive && syncFolders.length > 0 ? (
                  <TouchableOpacity style={styles.syncStopButton} onPress={handleStopOfflineSync}>
                    <Ionicons name="stop-circle-outline" size={18} color="#ef4444" />
                    <Text style={styles.syncStopButtonText}>Stop</Text>
                  </TouchableOpacity>
                ) : null}
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
            </View>

            <TouchableOpacity style={styles.addFolderFromDeviceBtn} onPress={handleAddFolderFromDevice}>
              <Ionicons name="folder-open-outline" size={20} color="#2563eb" />
              <Text style={styles.addFolderFromDeviceText}>Add Folder from Device</Text>
            </TouchableOpacity>

            {syncProgressText ? (
              <Text style={styles.syncProgressText}>{syncProgressText}</Text>
            ) : null}

            {syncFolders.length > 0 ? (
              <FlatList
                data={syncFolders}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={<Text style={styles.emptyText}>No folders marked for sync</Text>}
                renderItem={({ item }) => (
                  <View style={styles.syncFolderRow}>
                    <View style={styles.syncFolderInfo}>
                      <Ionicons name="folder" size={22} color="#f59e0b" />
                      <View style={styles.syncFolderTextWrap}>
                        <Text style={styles.syncFolderName}>{item.name}</Text>
                        <Text style={styles.syncFolderMeta}>{item.status || 'queued'}</Text>
                        {item.lastError ? (
                          <Text style={styles.syncFolderError} numberOfLines={2}>{item.lastError}</Text>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.syncRemoveButton}
                      onPress={async () => {
                        await removeOfflineSyncFolder(item.id);
                        await refreshOfflineSyncFolders();
                      }}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              />
            ) : (
              <Text style={styles.emptyText}>No folders marked for sync. Tap "Add Folder from Device" above.</Text>
            )}
          </>
        )}
      </View>

      {/* Stop Sync Confirmation Modal */}
      <Modal visible={isSyncStopConfirmVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.inputModalContent}>
            <Text style={styles.modalTitle}>Stop Sync</Text>
            <Text style={styles.modalSubtitle}>
              This will stop syncing all folders and disable the background sync task. You can add folders again later.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setIsSyncStopConfirmVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: '#ef4444' }]} onPress={confirmStopOfflineSync}>
                <Text style={styles.modalBtnTextLight}>Stop Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sync Folder Browser Modal */}
      <Modal visible={isSyncBrowserVisible} transparent animationType="slide">
        <View style={styles.fullModalOverlay}>
          <View style={styles.fullModalContent}>
            <View style={styles.fullModalHeader}>
              <TouchableOpacity onPress={() => setIsSyncBrowserVisible(false)} style={styles.fullModalBackBtn}>
                <Ionicons name="chevron-down" size={28} color="#0f172a" />
              </TouchableOpacity>
              <Text style={styles.fullModalTitle}>Select Folder to Sync</Text>
              <View style={styles.fullModalBackBtn} />
            </View>

            <View style={styles.fullModalBody}>
              <View style={styles.syncBrowserToolbar}>
                {syncBrowserHistory.length > 0 ? (
                  <TouchableOpacity onPress={handleSyncBrowserBack} style={styles.syncBrowserBackBtn}>
                    <Ionicons name="chevron-back" size={20} color="#0f172a" />
                    <Text style={styles.syncBrowserBackText}>Back</Text>
                  </TouchableOpacity>
                ) : <View />}
                <Text style={styles.syncBrowserPath} numberOfLines={1} ellipsizeMode="middle">
                  {syncBrowserPath.split('/').filter(Boolean).slice(-2).join('/') || 'Root'}
                </Text>
                <TouchableOpacity onPress={() => loadSyncBrowserFolders(syncBrowserPath)}>
                  <Ionicons name="refresh" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              {syncBrowserPath ? (
                <View style={styles.syncBrowserCurrentCard}>
                  <View style={styles.syncBrowserCurrentInfo}>
                    <Ionicons name="folder-open" size={22} color="#f59e0b" />
                    <View style={styles.syncBrowserCurrentTextWrap}>
                      <Text style={styles.syncBrowserCurrentTitle} numberOfLines={1}>
                        {getFolderDisplayName(syncBrowserPath)}
                      </Text>
                      <Text style={styles.syncBrowserCurrentMeta} numberOfLines={1} ellipsizeMode="middle">
                        {isSyncFolderMarked(syncBrowserPath) ? 'Already added' : 'Current folder'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.syncBrowserSelectCurrentBtn,
                      isSyncFolderMarked(syncBrowserPath) && styles.syncBrowserSelectBtnDisabled,
                    ]}
                    onPress={() => {
                      if (!isSyncFolderMarked(syncBrowserPath)) {
                        handleSelectSyncFolder({
                          id: syncBrowserPath,
                          name: getFolderDisplayName(syncBrowserPath),
                          path: syncBrowserPath,
                        });
                      }
                    }}
                    disabled={isSyncFolderMarked(syncBrowserPath)}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={20}
                      color={isSyncFolderMarked(syncBrowserPath) ? '#cbd5e1' : '#ffffff'}
                    />
                    <Text
                      style={[
                        styles.syncBrowserSelectCurrentText,
                        isSyncFolderMarked(syncBrowserPath) && styles.syncBrowserSelectTextDisabled,
                      ]}
                    >
                      {isSyncFolderMarked(syncBrowserPath) ? 'Added' : 'Select This Folder'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {isSyncBrowserLoading ? (
                <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
              ) : (
                <FlatList
                  data={syncBrowserFolders}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.syncBrowserList}
                  ListEmptyComponent={
                    <View style={styles.syncBrowserEmpty}>
                      <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
                      <Text style={styles.syncBrowserEmptyText}>No folders found</Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const isMarked = isSyncFolderMarked(item.path);
                    return (
                      <TouchableOpacity
                        style={[styles.syncBrowserFolderItem, isMarked && styles.syncBrowserFolderItemDisabled]}
                        onPress={() => {
                          if (!isMarked) {
                            handleBrowseSyncFolder(item.path);
                          }
                        }}
                        disabled={isMarked}
                      >
                        <View style={styles.syncBrowserFolderLeft}>
                          <Ionicons name="folder" size={24} color="#f59e0b" />
                          <View style={styles.syncBrowserFolderInfo}>
                            <Text style={styles.syncBrowserFolderName}>{item.name}</Text>
                            {isMarked && <Text style={styles.syncBrowserFolderMarkedText}>Already added</Text>}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[styles.syncBrowserSelectBtn, isMarked && styles.syncBrowserSelectBtnDisabled]}
                          onPress={() => {
                            if (!isMarked) {
                              handleSelectSyncFolder(item);
                            }
                          }}
                          disabled={isMarked}
                        >
                          <Ionicons name="checkmark-circle-outline" size={20} color={isMarked ? "#cbd5e1" : "#2563eb"} />
                          <Text style={[styles.syncBrowserSelectText, isMarked && styles.syncBrowserSelectTextDisabled]}>
                            {isMarked ? "Added" : "Select"}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!mediaPreview} transparent animationType="fade" onRequestClose={closeMediaPreview}>
        <View style={styles.mediaPreviewOverlay}>
          <View style={styles.mediaPreviewCard}>
            <View style={styles.mediaPreviewHeader}>
              <View style={styles.mediaPreviewTitleWrap}>
                <Text style={styles.mediaPreviewTitle} numberOfLines={1}>{mediaPreview?.item?.name || 'Preview'}</Text>
                <Text style={styles.mediaPreviewMeta}>{mediaPreview?.kind || 'media'} preview</Text>
              </View>
              <TouchableOpacity onPress={closeMediaPreview} style={styles.mediaPreviewCloseBtn}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={styles.mediaPreviewBody}>
              {mediaPreview?.kind === 'image' ? (
                <Image source={{ uri: mediaPreview.uri }} style={styles.mediaPreviewImage} resizeMode="contain" />
              ) : null}

              {mediaPreview?.kind === 'video' ? (
                <VideoView
                  style={styles.mediaPreviewVideo}
                  player={videoPreviewPlayer}
                  contentFit="contain"
                  nativeControls
                  allowsFullscreen
                />
              ) : null}

              {mediaPreview?.kind === 'audio' ? (
                <View style={styles.mediaPreviewAudio}>
                  <View style={styles.mediaPreviewAudioIcon}>
                    <Ionicons name="musical-notes" size={42} color="#34d399" />
                  </View>
                  <Text style={styles.mediaPreviewAudioTitle} numberOfLines={2}>{mediaPreview?.item?.name}</Text>
                  <TouchableOpacity style={styles.mediaPreviewPlayBtn} onPress={toggleAudioPreview}>
                    <Ionicons name={isPreviewAudioPlaying ? 'pause' : 'play'} size={26} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

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
              <Ionicons name="cut-outline" size={24} color="#0f172a" />
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
              <Ionicons name="share-outline" size={24} color="#0f172a" />
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
            <Text style={styles.pickerPathText}>{pickerPath ? (pickerPath.replace(getStorageDir() || '', 'Documents/').replace(getStorageRoot() || '', 'Device/')) : 'Device/'}</Text>
          </View>
          <FlatList
            data={pickerFolders}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.folderItem} onPress={() => {
                setPickerHistory([...pickerHistory, pickerPath]);
                const newPath = isSAFUri(pickerPath) ? item.path : `${pickerPath}${item.name}/`;
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
  pathIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
    gap: 6,
  },
  pathText: {
    fontSize: 12,
    color: '#64748b',
    flex: 1,
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 16,
    fontSize: 16,
  },
  browseStorageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  browseStorageBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
  syncFolderError: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 4,
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
  mediaPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  mediaPreviewCard: {
    width: '100%',
    maxHeight: '82%',
    borderRadius: 20,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  mediaPreviewHeader: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  mediaPreviewTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  mediaPreviewTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  mediaPreviewMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  mediaPreviewCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPreviewBody: {
    minHeight: 260,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPreviewImage: {
    width: '100%',
    height: 360,
  },
  mediaPreviewVideo: {
    width: '100%',
    height: 300,
    backgroundColor: '#000000',
  },
  mediaPreviewAudio: {
    width: '100%',
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  mediaPreviewAudioIcon: {
    width: 94,
    height: 94,
    borderRadius: 24,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mediaPreviewAudioTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 18,
  },
  mediaPreviewPlayBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
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
  syncToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  syncStopButtonText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  addFolderFromDeviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
  },
  addFolderFromDeviceText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  fullModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fullModalContent: {
    flex: 1,
    backgroundColor: '#f8fafc',
    marginTop: 40,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  fullModalBackBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  fullModalBody: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  syncBrowserToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  syncBrowserBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  syncBrowserBackText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  syncBrowserPath: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  syncBrowserCurrentCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  syncBrowserCurrentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  syncBrowserCurrentTextWrap: {
    flex: 1,
  },
  syncBrowserCurrentTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  syncBrowserCurrentMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  syncBrowserSelectCurrentBtn: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncBrowserSelectCurrentText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  syncBrowserList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  syncBrowserEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  syncBrowserEmptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  syncBrowserFolderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  syncBrowserFolderItemDisabled: {
    opacity: 0.5,
  },
  syncBrowserFolderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  syncBrowserFolderInfo: {
    marginLeft: 12,
    flex: 1,
  },
  syncBrowserFolderName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  syncBrowserFolderMarkedText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  syncBrowserSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
  },
  syncBrowserSelectBtnDisabled: {
    backgroundColor: '#f1f5f9',
  },
  syncBrowserSelectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  syncBrowserSelectTextDisabled: {
    color: '#94a3b8',
  },
  syncSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
  },
  syncSummaryText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  syncProgressText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 4,
    marginHorizontal: 16,
  },
  syncFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  syncFolderRowMarked: {
    backgroundColor: '#f0fdf4',
  },
  syncFolderBrowse: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  syncFolderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  syncFolderTextWrap: {
    flex: 1,
  },
  syncFolderName: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
  },
  syncFolderMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  syncFolderError: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 4,
  },
  syncRemoveButton: {
    padding: 4,
  },
});
