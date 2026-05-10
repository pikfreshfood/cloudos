import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Text, PanResponder, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from '../context/OSContext';

const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export default function BrowserScreen({ navigation, route }) {
  const { getStorageDir, osType } = useOS();
  const defaultUrl = osType === 'ios' ? 'https://www.apple.com' : 'https://www.google.com';
  const initialUrl = route?.params?.initialUrl || defaultUrl;
  const initialInputUrl = route?.params?.initialInputUrl || initialUrl;
  const browserMode = route?.params?.browserMode || 'default';
  const minimalChrome = route?.params?.minimalChrome === true;
  const showBottomMenu = route?.params?.showBottomMenu === true || !minimalChrome;
  const pageTitle = route?.params?.pageTitle || 'Browser';
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialInputUrl);
  const [loading, setLoading] = useState(false);
  const webViewRef = useRef(null);

  useEffect(() => {
    setUrl(initialUrl);
    setInputUrl(initialInputUrl);
  }, [initialInputUrl, initialUrl]);
  const iosHomePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => (
        osType === 'ios' &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx) &&
        gestureState.dy < -6
      ),
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => (
        osType === 'ios' &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx) &&
        gestureState.dy < -6
      ),
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -35) {
          navigation.navigate('MainOS', { screen: 'RecentAppsScreen' });
        }
      }
    })
  ).current;

  const handleNavigate = () => {
    let finalUrl = inputUrl.trim();
    if (!finalUrl) return;

    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        const searchEngine = osType === 'ios' ? 'https://duckduckgo.com/?q=' : 'https://www.google.com/search?q=';
        finalUrl = searchEngine + encodeURIComponent(finalUrl);
      }
    }
    setUrl(finalUrl);
  };

  const handleFileDownload = async (event) => {
    const downloadUrl = event.nativeEvent.downloadUrl;
    if (!downloadUrl) return;

    try {
      const fileName = downloadUrl.substring(downloadUrl.lastIndexOf('/') + 1) || `download_${Date.now()}`;
      const downloadsDir = `${getStorageDir()}Downloads/`;
      
      // Ensure Downloads directory exists
      const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
      }

      const fileUri = `${downloadsDir}${fileName}`;
      
      Alert.alert(
        "Download Started",
        `Downloading ${fileName}...`,
        [{ text: "OK" }]
      );

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        fileUri,
        {},
        (downloadProgress) => {
          // Could add progress tracking here if needed
        }
      );

      const { uri } = await downloadResumable.downloadAsync();
      
      Alert.alert(
        "Download Complete",
        `File saved to Downloads folder:\n${fileName}`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Download failed:", error);
      Alert.alert("Download Failed", "There was an error downloading the file.");
    }
  };

  return (
    <SafeAreaView style={[styles.container, osType === 'ios' ? styles.iosContainer : null]}>
      {osType === 'ios' ? (
        // --- iOS SAFARI UI ---
        <>
          {/* iOS Browser Header */}
          <View style={[styles.iosHeader, minimalChrome && styles.iosHeaderMinimal]}>
            {minimalChrome ? (
              <>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iosHeaderBtn}>
                  <Ionicons name="close-circle" size={28} color="#007aff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.iosMinimalReload}>
                  <Ionicons name="refresh" size={22} color="#007aff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iosHeaderBtn}>
                  <Text style={styles.iosCancelText}>Cancel</Text>
                </TouchableOpacity>
                <View style={styles.iosAddressBarContainer}>
                  <Ionicons name="text-outline" size={14} color="#8e8e93" style={styles.iosAAText} />
                  <Ionicons name="lock-closed" size={12} color="#8e8e93" style={styles.lockIcon} />
                  <TextInput
                    style={styles.iosAddressInput}
                    placeholder="Search or enter website"
                    placeholderTextColor="#8e8e93"
                    value={inputUrl}
                    onChangeText={setInputUrl}
                    onSubmitEditing={handleNavigate}
                    returnKeyType="go"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={() => webViewRef.current?.reload()}>
                    <Ionicons name="refresh" size={16} color="#8e8e93" style={styles.iosRefreshIcon} />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* Browser View */}
          <View style={styles.browserContainer}>
            {loading && (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color="#007aff" />
              </View>
            )}
            <WebView
              ref={webViewRef}
              source={{ uri: url }}
              userAgent={browserMode === 'desktop' ? DESKTOP_USER_AGENT : undefined}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onFileDownload={handleFileDownload}
              style={styles.webview}
            />
          </View>

          {/* iOS Safari Bottom Toolbar */}
          {!minimalChrome && (
            <View style={styles.iosBottomToolbar}>
              <TouchableOpacity onPress={() => webViewRef.current?.goBack()} style={styles.iosToolbarBtn}>
                <Ionicons name="chevron-back" size={28} color="#007aff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => webViewRef.current?.goForward()} style={styles.iosToolbarBtn}>
                <Ionicons name="chevron-forward" size={28} color="#007aff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iosToolbarBtn}>
                <Ionicons name="share-outline" size={28} color="#007aff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iosToolbarBtn}>
                <Ionicons name="book-outline" size={28} color="#007aff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iosToolbarBtn}>
                <Ionicons name="browsers-outline" size={28} color="#007aff" />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.navigate('RecentAppsScreen')}
            style={styles.iosHomeGestureArea}
            {...iosHomePanResponder.panHandlers}
          >
            <View style={styles.iosHomeIndicator} />
          </TouchableOpacity>
        </>
      ) : (
        // --- ANDROID BROWSER UI ---
        <>
          {/* Browser Header */}
          <View style={[styles.header, minimalChrome && styles.headerMinimal]}>
            {minimalChrome ? (
              <View style={styles.minimalHeaderActions}>
                <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.minimalReloadButton}>
                  <Ionicons name="refresh" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                  <Ionicons name="home" size={20} color="#64748b" />
                </TouchableOpacity>
                
                <View style={styles.navControls}>
                  <TouchableOpacity onPress={() => webViewRef.current?.goBack()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color="#64748b" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.iconButton}>
                    <Ionicons name="refresh" size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <View style={styles.addressBarContainer}>
                  <Ionicons name="lock-closed" size={14} color="#94a3b8" style={styles.lockIcon} />
                  <TextInput
                    style={styles.addressInput}
                    placeholder="Search or enter website"
                    value={inputUrl}
                    onChangeText={setInputUrl}
                    onSubmitEditing={handleNavigate}
                    returnKeyType="go"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={handleNavigate} style={styles.goButton}>
                    <Ionicons name="arrow-forward-circle" size={24} color="#3b82f6" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {!!route?.params?.pageTitle && (
            <View style={styles.pageModeBanner}>
              <Text style={styles.pageModeTitle}>{pageTitle}</Text>
              {browserMode === 'desktop' ? (
                <Text style={styles.pageModeSubtitle}>Desktop view enabled for QR sign-in</Text>
              ) : null}
            </View>
          )}

          {/* Browser View */}
          <View style={styles.browserContainer}>
            {loading && (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
              </View>
            )}
            <WebView
              ref={webViewRef}
              source={{ uri: url }}
              userAgent={browserMode === 'desktop' ? DESKTOP_USER_AGENT : undefined}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onFileDownload={handleFileDownload}
              style={styles.webview}
            />
          </View>
          
          {/* Bottom Navigation Bar */}
          {showBottomMenu && (
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
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerMinimal: {
    justifyContent: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#25D366',
    borderBottomColor: '#22c55e',
  },
  minimalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  minimalReloadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
  },
  navControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  iconButton: {
    padding: 6,
    marginRight: 4,
  },
  addressBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  lockIcon: {
    marginRight: 6,
  },
  addressInput: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    height: '100%',
  },
  goButton: {
    padding: 2,
    marginLeft: 4,
  },
  browserContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  pageModeBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ecfdf5',
    borderBottomWidth: 1,
    borderBottomColor: '#d1fae5',
  },
  pageModeTitle: {
    color: '#065f46',
    fontSize: 14,
    fontWeight: '800',
  },
  pageModeSubtitle: {
    color: '#047857',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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
  // iOS Styles
  iosContainer: {
    backgroundColor: '#f8f8f8',
  },
  iosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d1d6',
  },
  iosHeaderMinimal: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f8f8f8',
    borderBottomColor: '#e5e5ea',
  },
  iosMinimalReload: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
  },
  iosHeaderBtn: {
    marginRight: 12,
  },
  iosCancelText: {
    color: '#007aff',
    fontSize: 17,
  },
  iosAddressBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3e3e9',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  iosAAText: {
    marginRight: 6,
    fontWeight: 'bold',
  },
  iosAddressInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    height: '100%',
  },
  iosRefreshIcon: {
    marginLeft: 6,
  },
  iosBottomToolbar: {
    height: 49,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderTopWidth: 1,
    borderTopColor: '#d1d1d6',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  iosToolbarBtn: {
    padding: 8,
  },
  iosHomeGestureArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 54,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    zIndex: 20,
  },
  iosHomeIndicator: {
    width: Dimensions.get('window').width * 0.35,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
});
