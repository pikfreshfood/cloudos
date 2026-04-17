import React, { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Text, PanResponder, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from '../context/OSContext';

export default function BrowserScreen({ navigation }) {
  const { getStorageDir, osType } = useOS();
  const [url, setUrl] = useState(osType === 'ios' ? 'https://www.apple.com' : 'https://www.google.com');
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const webViewRef = useRef(null);
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
          navigation.navigate('RecentAppsScreen');
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
          <View style={styles.iosHeader}>
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
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onFileDownload={handleFileDownload}
              style={styles.webview}
            />
          </View>

          {/* iOS Safari Bottom Toolbar */}
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
          <View style={styles.header}>
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
          </View>

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
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onFileDownload={handleFileDownload}
              style={styles.webview}
            />
          </View>
          
          {/* Bottom Navigation Bar */}
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
