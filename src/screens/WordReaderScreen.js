import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { fileService } from '../services/api';

const getEditableCopyPath = (uri) => `${uri}.editable.html`;
const getRemoteEditablePath = (path) => `${path}.editable.html`;

const sanitizeCacheSegment = (value) => (
  String(value || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'file'
);

const buildWordViewerHtml = ({ fileName, base64, savedHtml, isEditable }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>${fileName}</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: #e2e8f0;
        color: #0f172a;
        font-family: Arial, sans-serif;
      }
      #status {
        padding: 14px 16px;
        font-size: 14px;
        background: #0f172a;
        color: #e2e8f0;
        position: sticky;
        top: 0;
        z-index: 20;
      }
      #viewer {
        max-width: 900px;
        margin: 0 auto;
        padding: 20px 14px 40px;
      }
      .page {
        background: #ffffff;
        border-radius: 16px;
        padding: 24px 20px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
      }
      .page h1, .page h2, .page h3, .page h4 {
        color: #0f172a;
      }
      .page[contenteditable="true"] {
        outline: none;
        box-shadow: 0 18px 40px rgba(37, 99, 235, 0.18);
      }
      .page p, .page li {
        line-height: 1.65;
        color: #334155;
      }
      .error {
        color: #ef4444;
      }
      .hint {
        margin-top: 10px;
        color: #475569;
        line-height: 1.6;
      }
    </style>
    <script src="https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js"></script>
  </head>
  <body>
    <div id="status">Opening document...</div>
    <div id="viewer"></div>
    <script>
      const fileName = ${JSON.stringify(fileName)};
      const docBase64 = ${JSON.stringify(base64)};
      const savedHtml = ${JSON.stringify(savedHtml || '')};
      const isEditable = ${JSON.stringify(!!isEditable)};
      const statusEl = document.getElementById('status');
      const viewerEl = document.getElementById('viewer');

      const base64ToArrayBuffer = (encoded) => {
        const binary = atob(encoded);
        const length = binary.length;
        const bytes = new Uint8Array(length);
        for (let index = 0; index < length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes.buffer;
      };

      const showDocFallback = () => {
        statusEl.textContent = 'Legacy .doc files are not fully supported in this viewer.';
        viewerEl.innerHTML = '<div class="page"><h2 class="error">Cannot preview this file here</h2><p class="hint">This main Word reader can render modern <strong>.docx</strong> documents. Older <strong>.doc</strong> files need conversion to .docx before they can be displayed properly.</p></div>';
      };

      const renderEditablePage = (html) => {
        viewerEl.innerHTML = '<div id="doc-page" class="page" contenteditable="' + isEditable + '">' + html + '</div>';
        statusEl.textContent = isEditable ? (fileName + ' (editing)') : fileName;
      };

      const renderDocx = async () => {
        try {
          if (savedHtml) {
            renderEditablePage(savedHtml);
            return;
          }

          const result = await mammoth.convertToHtml({ arrayBuffer: base64ToArrayBuffer(docBase64) });
          renderEditablePage(result.value);
        } catch (error) {
          statusEl.textContent = 'Unable to open this document.';
          viewerEl.innerHTML = '<div class="page"><h2 class="error">Document preview failed</h2><p class="hint">' + (error && error.message ? error.message : 'Unknown document error') + '</p></div>';
        }
      };

      window.addEventListener('message', (event) => {
        if (!event || !event.data) return;

        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch (error) {
          return;
        }

        if (payload.type === 'save-html') {
          const page = document.getElementById('doc-page');
          const html = page ? page.innerHTML : '';
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'save-html',
            html,
          }));
        }
      });

      if (fileName.toLowerCase().endsWith('.doc')) {
        showDocFallback();
      } else {
        renderDocx();
      }
    </script>
  </body>
</html>`;

export default function WordReaderScreen({ navigation, route }) {
  const { getStorageDir, osType, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const [docs, setDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(route?.params?.document || null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewerBase64, setViewerBase64] = useState('');
  const [isOpeningDoc, setIsOpeningDoc] = useState(false);
  const [savedHtml, setSavedHtml] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef(null);
  const [resolvedDocUri, setResolvedDocUri] = useState('');
  const [resolvedRemoteEditablePath, setResolvedRemoteEditablePath] = useState('');
  const hasApiContext = !!currentUser?.id && !!currentDevice?.id;

  useFocusEffect(
    useCallback(() => {
      if (route?.params?.document) {
        setSelectedDoc(route.params.document);
        setIsEditMode(false);
      }
      fetchFiles();
    }, [route?.params?.document])
  );

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const files = [];

      if (hasApiContext) {
        const collectRemoteFiles = async (folderPath = '') => {
          const response = await fileService.list({
            userId: currentUser.id,
            deviceId: currentDevice.id,
            folderPath,
          });

          for (const item of response.files || []) {
            if (item.type === 'folder') {
              const nextFolderPath = item.path
                ?.replace(`uploads/${currentUser.id}/${currentDevice.id}/`, '')
                .replace(/\\/g, '/')
                .replace(/^\/+|\/+$/g, '');
              await collectRemoteFiles(nextFolderPath);
              continue;
            }

            const ext = item.name?.split('.').pop()?.toLowerCase();
            if (['doc', 'docx'].includes(ext)) {
              files.push({
                id: item.id || item.path,
                title: item.name,
                size: item.size || 'Unknown',
                uri: '',
                remotePath: item.path,
                isRemote: true,
              });
            }
          }
        };

        await collectRemoteFiles('');
      } else {
        const scanDirectory = async (dirPath) => {
          const dirInfo = await FileSystem.getInfoAsync(dirPath);
          if (!dirInfo.exists || !dirInfo.isDirectory) {
            return;
          }

          const items = await FileSystem.readDirectoryAsync(dirPath);
          for (const item of items) {
            if (item.startsWith('.')) continue;

            const itemPath = `${dirPath}${item}`;
            const info = await FileSystem.getInfoAsync(itemPath);
            if (info.isDirectory) {
              await scanDirectory(`${itemPath}/`);
            } else {
              const ext = item.split('.').pop()?.toLowerCase();
              if (['doc', 'docx'].includes(ext)) {
                files.push({
                  id: itemPath,
                  title: item,
                  size: info.size ? `${(info.size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown',
                  uri: itemPath,
                  remotePath: null,
                  isRemote: false,
                });
              }
            }
          }
        };

        const baseDir = getStorageDir() || '';
        if (baseDir) {
          await scanDirectory(baseDir);
        }
      }
      setDocs(files);
    } catch (error) {
      console.error('Failed to fetch word files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadSelectedDoc = async () => {
      if (!selectedDoc?.uri && !selectedDoc?.remotePath) {
        setViewerBase64('');
        setSavedHtml('');
        setResolvedDocUri('');
        setResolvedRemoteEditablePath('');
        setIsOpeningDoc(false);
        return;
      }

      setIsOpeningDoc(true);
      try {
        let sourceUri = selectedDoc?.uri;
        let remoteEditablePath = '';

        if (selectedDoc?.isRemote && selectedDoc?.remotePath && hasApiContext) {
          const downloadUrl = fileService.getDownloadUrl({
            userId: currentUser.id,
            deviceId: currentDevice.id,
            path: selectedDoc.remotePath,
          });
          const extension = selectedDoc.title?.toLowerCase().endsWith('.doc') ? 'doc' : 'docx';
          const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
          const cacheDir = `${cacheRoot}word-downloads/${sanitizeCacheSegment(currentUser.id)}/${sanitizeCacheSegment(currentDevice.id)}/`;
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
          const baseName = sanitizeCacheSegment(selectedDoc.title || selectedDoc.remotePath.split('/').pop() || `document.${extension}`);
          const cachedUri = `${cacheDir}${baseName.toLowerCase().endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`}`;
          await FileSystem.downloadAsync(downloadUrl, cachedUri);
          sourceUri = cachedUri;
          remoteEditablePath = getRemoteEditablePath(selectedDoc.remotePath);
        }

        if (!sourceUri) {
          throw new Error('No Word document source available.');
        }

        const base64 = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const editableCopyPath = getEditableCopyPath(sourceUri);
        const editableCopyInfo = await FileSystem.getInfoAsync(editableCopyPath);
        let editableHtml = editableCopyInfo.exists
          ? await FileSystem.readAsStringAsync(editableCopyPath)
          : '';

        if (!editableHtml && remoteEditablePath) {
          try {
            const remoteEditableUrl = fileService.getDownloadUrl({
              userId: currentUser.id,
              deviceId: currentDevice.id,
              path: remoteEditablePath,
            });
            const cachedEditableUri = `${editableCopyPath}`;
            await FileSystem.downloadAsync(remoteEditableUrl, cachedEditableUri);
            editableHtml = await FileSystem.readAsStringAsync(cachedEditableUri);
          } catch (error) {
            editableHtml = '';
          }
        }

        if (isMounted) {
          setViewerBase64(base64);
          setSavedHtml(editableHtml);
          setResolvedDocUri(sourceUri);
          setResolvedRemoteEditablePath(remoteEditablePath);
          setWebViewKey((current) => current + 1);
        }
      } catch (error) {
        console.error('Failed to open selected word document:', error);
        if (isMounted) {
          setViewerBase64('');
          setSavedHtml('');
          setResolvedDocUri('');
          setResolvedRemoteEditablePath('');
        }
      } finally {
        if (isMounted) {
          setIsOpeningDoc(false);
        }
      }
    };

    loadSelectedDoc();

    return () => {
      isMounted = false;
    };
  }, [currentDevice?.id, currentUser?.id, selectedDoc]);

  const selectedDocHtml = useMemo(
    () => (
      selectedDoc?.title && viewerBase64
        ? buildWordViewerHtml({
            fileName: selectedDoc.title,
            base64: viewerBase64,
            savedHtml,
            isEditable: isEditMode,
          })
        : ''
    ),
    [selectedDoc, viewerBase64, savedHtml, isEditMode]
  );

  const handleSaveDocument = async (html) => {
    if (!resolvedDocUri) return;

    setIsSavingDoc(true);
    try {
      const editableCopyPath = getEditableCopyPath(resolvedDocUri);
      await FileSystem.writeAsStringAsync(editableCopyPath, html);

      if (hasApiContext && selectedDoc?.remotePath && resolvedRemoteEditablePath) {
        await fileService.saveHtmlCompanion({
          userId: currentUser.id,
          deviceId: currentDevice.id,
          path: selectedDoc.remotePath,
          html,
        });
      }

      setSavedHtml(html);
      setIsEditMode(false);
      setWebViewKey((current) => current + 1);
    } catch (error) {
      console.error('Failed to save editable document copy:', error);
    } finally {
      setIsSavingDoc(false);
    }
  };

  const requestSaveFromWebView = () => {
    if (!webViewRef.current || isSavingDoc) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'save-html' }));
  };

  const canEditSelectedDoc = !!selectedDoc?.title && selectedDoc.title.toLowerCase().endsWith('.docx');

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.item} onPress={() => setSelectedDoc(item)}>
      <View style={styles.iconContainer}>
        <Ionicons name="document" size={24} color="#2563eb" />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.size}>{item.size}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#94a3b8" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (selectedDoc) {
              setSelectedDoc(null);
              return;
            }
            navigation.goBack();
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{selectedDoc ? 'Main Word Reader' : 'Word Library'}</Text>
        <TouchableOpacity onPress={fetchFiles} style={styles.backBtn}>
          <Ionicons name="refresh" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {selectedDoc ? (
          <View style={styles.readerContainer}>
            <View style={styles.readerHeader}>
              <View style={styles.readerMeta}>
                <Text style={styles.readerTitle} numberOfLines={1}>{selectedDoc.title}</Text>
                <Text style={styles.readerSubTitle}>
                  {isEditMode ? (hasApiContext ? 'Editing Laravel-backed HTML draft' : 'Editing saved local copy') : (selectedDoc.size || 'Word document')}
                </Text>
              </View>
              <View style={styles.readerActions}>
                {canEditSelectedDoc && !isEditMode ? (
                  <TouchableOpacity onPress={() => setIsEditMode(true)} style={styles.readerActionBtn}>
                    <Ionicons name="create-outline" size={24} color="#2563eb" />
                  </TouchableOpacity>
                ) : null}
                {canEditSelectedDoc && isEditMode ? (
                  <TouchableOpacity onPress={requestSaveFromWebView} style={styles.readerActionBtn}>
                    {isSavingDoc ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Ionicons name="save-outline" size={24} color="#16a34a" />
                    )}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    setIsEditMode(false);
                    setSelectedDoc(null);
                  }}
                  style={styles.closeBtn}
                >
                  <Ionicons name="close-circle" size={28} color="#0f172a" />
                </TouchableOpacity>
              </View>
            </View>

            {isOpeningDoc ? (
              <View style={styles.loadingViewer}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingViewerText}>Opening document...</Text>
              </View>
            ) : (
              <WebView
                key={webViewKey}
                ref={webViewRef}
                source={{ html: selectedDocHtml }}
                style={styles.webview}
                originWhitelist={['*']}
                mixedContentMode="always"
                allowFileAccess
                allowFileAccessFromFileURLs
                allowUniversalAccessFromFileURLs
                onMessage={(event) => {
                  try {
                    const payload = JSON.parse(event.nativeEvent.data);
                    if (payload.type === 'save-html') {
                      handleSaveDocument(payload.html || '');
                    }
                  } catch (error) {
                    console.error('Failed to handle document save message:', error);
                  }
                }}
              />
            )}
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{hasApiContext ? 'Cloud Word Docs' : 'Local Word Docs'}</Text>
            </View>

            {isLoading ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={docs}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={(
                  <View style={styles.emptyState}>
                    <Ionicons name="document-outline" size={64} color="#cbd5e1" />
                    <Text style={styles.emptyText}>No Word docs found</Text>
                    <Text style={styles.emptySubText}>
                      {hasApiContext ? 'Upload DOC or DOCX files through Files to open them from Laravel.' : 'Add DOC or DOCX files using Files app'}
                    </Text>
                  </View>
                )}
              />
            )}
          </>
        )}
      </View>

      {osType !== 'ios' && (
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('RecentAppsScreen')}>
            <Ionicons name="menu" size={24} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('DesktopScreen')}>
            <Ionicons name="radio-button-off" size={24} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => {
              if (selectedDoc) {
                setSelectedDoc(null);
                return;
              }
              navigation.goBack();
            }}
          >
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
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    padding: 4,
    width: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  content: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  size: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#475569',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
  },
  readerContainer: {
    flex: 1,
    backgroundColor: '#e2e8f0',
  },
  readerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  readerMeta: {
    flex: 1,
    marginRight: 16,
  },
  readerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  readerSubTitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  closeBtn: {
    padding: 4,
  },
  readerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readerActionBtn: {
    padding: 4,
  },
  webview: {
    flex: 1,
    backgroundColor: '#e2e8f0',
  },
  loadingViewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingViewerText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '600',
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
});
