import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useOS } from '../context/OSContext';
import { installApk } from '../native/apkInstaller';

const { width, height } = Dimensions.get('window');

/**
 * Cloud Studio Screen
 * Allows streaming "raw" apps by uploading APKs or Source Code.
 * Integrates with remote streaming engines (simulated via Appetize/WebView).
 */
export default function CloudStudioScreen({ navigation }) {
  const { osType } = useOS();
  const [selectedFile, setSelectedFile] = useState(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [streamUrl, setStreamUrl] = useState(null);
  const [buildStep, setBuildStep] = useState('');
  const [webViewLoading, setWebViewLoading] = useState(true);
  const isApkFile = (file) => {
    const name = String(file?.name || '').toLowerCase();
    const mime = String(file?.mimeType || '').toLowerCase();
    return name.endsWith('.apk') || mime.includes('android.package-archive');
  };

  const pickAppFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.android.package-archive', 'application/zip', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setSelectedFile(result.assets[0]);
        setStreamUrl(null); // Reset stream if new file picked
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const startStream = async () => {
    if (!selectedFile) return;

    setIsBuilding(true);
    setBuildStep('Initializing Cloud Runner...');
    
    // Simulate Build/Stream Pipeline
    setTimeout(() => setBuildStep('Extracting Raw Assets...'), 1000);
    setTimeout(() => setBuildStep('Compiling Remote Runtime...'), 2500);
    setTimeout(() => setBuildStep('Preparing call flow...'), 4000);
    
    setTimeout(() => {
      setIsBuilding(false);
      // Using a valid public demo key from Appetize to ensure the stream loads correctly.
      setStreamUrl('https://appetize.io/embed/demo_r0m76edba009m69970966n0m6p?device=pixel4&osVersion=11.0&scale=75&autoplay=true');
    }, 5500);
  };

  const installSelectedApk = async () => {
    if (!selectedFile) return;
    if (Platform.OS !== 'android') {
      Alert.alert('Unavailable', 'APK installation is only available on Android devices.');
      return;
    }

    if (!isApkFile(selectedFile)) {
      Alert.alert('Unavailable', 'Please select a valid APK file.');
      return;
    }

    try {
      setIsBuilding(true);
      setBuildStep('Preparing APK installer...');
      const targetDir = `${FileSystem.cacheDirectory}apk-installs/`;
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

      const safeName = String(selectedFile.name || 'cloud-studio-app.apk').replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = `${targetDir}${Date.now()}-${safeName.endsWith('.apk') ? safeName : `${safeName}.apk`}`;

      await FileSystem.copyAsync({
        from: selectedFile.uri,
        to: targetPath,
      });

      setBuildStep('Opening Android installer...');
      await installApk(targetPath);
      Alert.alert('Installer opened', 'Complete installation in Android package installer.');
    } catch (err) {
      Alert.alert(
        'Install failed',
        err?.message || 'Could not open Android package installer for this APK.'
      );
    } finally {
      setIsBuilding(false);
      setBuildStep('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Cloud Studio</Text>
          <Text style={styles.headerSubtitle}>App Streamer & Debugger</Text>
        </View>
        <TouchableOpacity onPress={() => setSelectedFile(null)} style={styles.resetBtn}>
          <Ionicons name="refresh" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {!streamUrl ? (
          <View style={styles.setupContainer}>
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="cloud-sync" size={48} color="#3b82f6" />
              <Text style={styles.infoTitle}>Stream Raw Apps</Text>
              <Text style={styles.infoDesc}>
                Upload an uncompiled project (ZIP) or a raw APK to stream it directly to your Cloud OS.
              </Text>
            </View>

            <TouchableOpacity style={styles.filePicker} onPress={pickAppFile}>
              {selectedFile ? (
                <View style={styles.selectedFileInfo}>
                  <Ionicons name="document-attach" size={32} color="#10b981" />
                  <Text style={styles.fileName}>{selectedFile.name}</Text>
                  <Text style={styles.fileSize}>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</Text>
                </View>
              ) : (
                <>
                  <Ionicons name="file-tray-full-outline" size={64} color="#94a3b8" />
                  <Text style={styles.pickerText}>Select APK or Source (ZIP)</Text>
                </>
              )}
            </TouchableOpacity>

            {isBuilding ? (
              <View style={styles.buildLoader}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.buildStepText}>{buildStep}</Text>
              </View>
            ) : (
              <TouchableOpacity 
                style={[styles.streamBtn, !selectedFile && styles.streamBtnDisabled]} 
                onPress={isApkFile(selectedFile) ? installSelectedApk : startStream}
                disabled={!selectedFile}
              >
                <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.gradientBtn}>
                  <Ionicons name={isApkFile(selectedFile) ? 'download' : 'play'} size={24} color="#fff" />
                  <Text style={styles.streamBtnText}>{isApkFile(selectedFile) ? 'Install APK' : 'Start Remote Stream'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.streamContainer}>
            {webViewLoading && (
              <View style={styles.webViewLoader}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingStreamText}>Establishing Secure Connection...</Text>
              </View>
            )}
            <WebView 
              source={{ uri: streamUrl }}
              style={styles.webview}
              scalesPageToFit={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onLoadEnd={() => setWebViewLoading(false)}
              onLoadStart={() => setWebViewLoading(true)}
            />
            <View style={styles.streamOverlay}>
              <TouchableOpacity style={styles.closeStreamBtn} onPress={() => setStreamUrl(null)}>
                <Ionicons name="power" size={20} color="#fff" />
                <Text style={styles.closeStreamText}>End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* OS Navigation */}
      {osType !== 'ios' && !streamUrl && (
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('RecentAppsScreen')}>
            <Ionicons name="menu" size={24} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('DesktopScreen')}>
            <Ionicons name="radio-button-off" size={24} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: {
    marginRight: 15,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  resetBtn: {
    marginLeft: 'auto',
  },
  content: {
    flex: 1,
  },
  setupContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  infoCard: {
    alignItems: 'center',
    marginBottom: 40,
  },
  infoTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 15,
  },
  infoDesc: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  filePicker: {
    width: '100%',
    height: 200,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#334155',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  pickerText: {
    color: '#64748b',
    marginTop: 10,
    fontWeight: '600',
  },
  selectedFileInfo: {
    alignItems: 'center',
  },
  fileName: {
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 10,
  },
  fileSize: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  streamBtn: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  streamBtnDisabled: {
    opacity: 0.5,
  },
  gradientBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  streamBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buildLoader: {
    alignItems: 'center',
  },
  buildStepText: {
    color: '#3b82f6',
    marginTop: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },
  streamContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  webViewLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  loadingStreamText: {
    color: '#3b82f6',
    marginTop: 15,
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 1,
  },
  streamOverlay: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  closeStreamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  closeStreamText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  bottomNav: {
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  navBtn: {
    padding: 15,
  }
});
