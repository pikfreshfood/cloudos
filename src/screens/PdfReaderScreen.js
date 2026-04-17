import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { fileService } from '../services/api';

const buildPdfViewerHtml = (pdfBase64) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>PDF Reader</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #0f172a;
        color: #e2e8f0;
        font-family: Arial, sans-serif;
        min-height: 100%;
      }
      #status {
        padding: 14px 16px;
        font-size: 14px;
        background: #111827;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      #viewer {
        padding: 16px 10px 48px;
      }
      canvas {
        display: block;
        width: calc(100% - 12px);
        max-width: 980px;
        margin: 0 auto 18px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
      }
      .error {
        color: #fca5a5;
      }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js"></script>
  </head>
  <body>
    <div id="status">Opening PDF…</div>
    <div id="viewer"></div>
    <script>
      const pdfBase64 = ${JSON.stringify(pdfBase64)};
      const statusEl = document.getElementById('status');
      const viewerEl = document.getElementById('viewer');

      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';

      const base64ToUint8Array = (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      };

      const renderDocument = async () => {
        try {
          const pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(pdfBase64) }).promise;
          statusEl.textContent = 'Pages: ' + pdf.numPages;

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.25 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            viewerEl.appendChild(canvas);

            await page.render({
              canvasContext: context,
              viewport,
            }).promise;
          }
        } catch (error) {
          statusEl.textContent = 'Unable to open this PDF.';
          statusEl.className = 'error';
          viewerEl.innerHTML = '<p class="error" style="padding:16px;">' + (error && error.message ? error.message : 'Unknown PDF error') + '</p>';
        }
      };

      renderDocument();
    </script>
  </body>
</html>`;

const sanitizeCacheSegment = (value) => (
  String(value || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'file'
);

export default function PdfReaderScreen({ navigation, route }) {
  const { getStorageDir, osType, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const [docs, setDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(route?.params?.document || null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewerBase64, setViewerBase64] = useState('');
  const [isOpeningDoc, setIsOpeningDoc] = useState(false);
  const hasApiContext = !!currentUser?.id && !!currentDevice?.id;

  useFocusEffect(
    useCallback(() => {
      if (route?.params?.document) {
        setSelectedDoc(route.params.document);
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
            if (ext === 'pdf') {
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
              if (ext === 'pdf') {
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
      console.error('Failed to fetch pdf files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadSelectedPdf = async () => {
      if (!selectedDoc?.uri && !selectedDoc?.remotePath) {
        setViewerBase64('');
        setIsOpeningDoc(false);
        return;
      }

      setIsOpeningDoc(true);
      try {
        let sourceUri = selectedDoc?.uri;

        if (selectedDoc?.isRemote && selectedDoc?.remotePath && hasApiContext) {
          const downloadUrl = fileService.getDownloadUrl({
            userId: currentUser.id,
            deviceId: currentDevice.id,
            path: selectedDoc.remotePath,
          });
          const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
          const cacheDir = `${cacheRoot}pdf-downloads/${sanitizeCacheSegment(currentUser.id)}/${sanitizeCacheSegment(currentDevice.id)}/`;
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
          const fileName = sanitizeCacheSegment(selectedDoc.title || selectedDoc.remotePath.split('/').pop() || 'document.pdf');
          const cachedUri = `${cacheDir}${fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`}`;
          await FileSystem.downloadAsync(downloadUrl, cachedUri);
          sourceUri = cachedUri;
        }

        if (!sourceUri) {
          throw new Error('No PDF source available.');
        }

        const base64 = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (isMounted) {
          setViewerBase64(base64);
        }
      } catch (error) {
        console.error('Failed to open selected PDF:', error);
        if (isMounted) {
          setViewerBase64('');
        }
      } finally {
        if (isMounted) {
          setIsOpeningDoc(false);
        }
      }
    };

    loadSelectedPdf();

    return () => {
      isMounted = false;
    };
  }, [currentDevice?.id, currentUser?.id, selectedDoc]);

  const selectedDocHtml = useMemo(
    () => (viewerBase64 ? buildPdfViewerHtml(viewerBase64) : ''),
    [viewerBase64]
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.item} onPress={() => setSelectedDoc(item)}>
      <View style={styles.iconContainer}>
        <Ionicons name="document-text" size={24} color="#ef4444" />
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
        <Text style={styles.headerTitle}>{selectedDoc ? 'Main PDF Reader' : 'PDF Library'}</Text>
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
                <Text style={styles.readerSubTitle}>{selectedDoc.size || 'PDF document'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDoc(null)} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={28} color="#0f172a" />
              </TouchableOpacity>
            </View>
            {isOpeningDoc ? (
              <View style={styles.loadingViewer}>
                <ActivityIndicator size="large" color="#ef4444" />
                <Text style={styles.loadingViewerText}>Opening PDF...</Text>
              </View>
            ) : (
              <WebView
                source={{ html: selectedDocHtml }}
                style={styles.webview}
                originWhitelist={['*']}
                allowFileAccess
                allowFileAccessFromFileURLs
                allowUniversalAccessFromFileURLs
                mixedContentMode="always"
              />
            )}
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{hasApiContext ? 'Cloud PDFs' : 'Local PDFs'}</Text>
            </View>

            {isLoading ? (
              <ActivityIndicator size="large" color="#ef4444" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={docs}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={(
                  <View style={styles.emptyState}>
                    <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
                    <Text style={styles.emptyText}>No PDFs found</Text>
                    <Text style={styles.emptySubText}>
                      {hasApiContext ? 'Upload PDF files through Files to read them from Laravel.' : 'Add PDF files using Files app'}
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
    backgroundColor: '#fef2f2',
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
    backgroundColor: '#0f172a',
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
  webview: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingViewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingViewerText: {
    color: '#e2e8f0',
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
