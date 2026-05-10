import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image, ImageBackground, Modal, PanResponder, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecentApps } from '../context/RecentAppsContext';
import { useWallpaper } from '../context/WallpaperContext';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { API_URL, messageService } from '../services/api';
import { loadInstalledApps } from '../services/installedApps';

const settingsIconAsset = require('../../assets/settings-removebg-preview.png');
const appStoreIconAsset = require('../../assets/appsotr-removebg-preview.png');

const DOCK_APPS_ANDROID = [
  { id: 'phone', name: 'Phone', icon: 'call', type: 'ionicon', screen: 'ContactsScreen', color: '#10b981' },
  { id: 'messages-dock', name: 'Messages', icon: 'chatbubble', type: 'ionicon', screen: 'MessagesScreen', color: '#3b82f6' },
  { id: 'browser', name: 'Browser', icon: 'google-chrome', type: 'material', screen: 'BrowserScreen', color: '#3b82f6' },
];

const DOCK_APPS_IOS = [
  { id: 'phone', name: 'Phone', icon: 'call', type: 'ionicon', screen: 'ContactsScreen', color: '#25D366' },
  { id: 'safari', name: 'Safari', icon: 'compass-outline', type: 'custom-safari', screen: 'BrowserScreen', color: '#FFFFFF' },
  { id: 'messages-dock', name: 'Messages', icon: 'chatbubble', type: 'ionicon', screen: 'MessagesScreen', color: '#34C759' },
];

const APPS_ANDROID = [
  { id: 'music', name: 'Music', icon: 'musical-notes', type: 'ionicon', screen: 'MusicScreen', color: '#10b981' },
  { id: 'camera', name: 'Camera', icon: 'camera', type: 'custom-camera', screen: 'CameraScreen', color: '#d7d9de' },
  { id: 'calculator', name: 'Calculator', icon: 'calculator', type: 'ionicon', screen: 'CalculatorScreen', color: '#f59e0b' },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    type: 'material',
    screen: 'BrowserScreen',
    color: '#1877f2',
    params: {
      initialUrl: 'https://m.facebook.com',
      initialInputUrl: 'facebook.com',
      minimalChrome: true,
      showBottomMenu: true,
      pageTitle: 'Facebook',
    },
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: 'whatsapp',
    type: 'material',
    screen: 'BrowserScreen',
    color: '#25D366',
    params: {
      initialUrl: 'https://web.whatsapp.com',
      initialInputUrl: 'web.whatsapp.com',
      browserMode: 'desktop',
      minimalChrome: true,
      showBottomMenu: true,
      pageTitle: 'WhatsApp Web',
    },
  },
  { id: 'contacts', name: 'Contacts', icon: 'people', type: 'ionicon', screen: 'ContactsScreen', color: '#8b5cf6' },
  { id: 'gallery', name: 'Gallery', icon: 'images', type: 'ionicon', screen: 'GalleryScreen', color: '#ec4899' },
  { id: 'calendar', name: 'Calendar', icon: 'calendar', type: 'ionicon', screen: 'CalendarScreen', color: '#ef4444' },
  { id: 'files', name: 'Files', icon: 'folder', type: 'ionicon', screen: 'FilesScreen', color: '#0ea5e9' },
  { id: 'settings', name: 'Settings', icon: 'settings', type: 'ionicon', screen: 'SettingsScreen', color: '#64748b' },
  { id: 'appstore', name: 'App Store', icon: 'cart', type: 'ionicon', screen: 'AppStoreScreen', color: '#0ea5e9' },
  { id: 'shareapp', name: 'Share App', icon: 'share-social', type: 'ionicon', screen: 'ShareAppScreen', color: '#6366f1' },
  { id: 'videoplayer', name: 'Video Player', icon: 'videocam', type: 'ionicon', screen: 'VideoPlayerScreen', color: '#f43f5e' },
];

const APPS_IOS = [
  { id: 'camera-home-slot', name: 'Camera', icon: 'camera', type: 'custom-camera', screen: 'CameraScreen', color: '#d7d9de' },
  { id: 'calculator', name: 'Calculator', icon: 'calculator', type: 'ionicon', screen: 'CalculatorScreen', color: '#FF9F0A' },
  { id: 'music', name: 'Music', icon: 'musical-notes', type: 'ionicon', screen: 'MusicScreen', color: '#FF2D55' },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    type: 'material',
    screen: 'BrowserScreen',
    color: '#1877f2',
    params: {
      initialUrl: 'https://m.facebook.com',
      initialInputUrl: 'facebook.com',
      minimalChrome: true,
      showBottomMenu: true,
      pageTitle: 'Facebook',
    },
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: 'whatsapp',
    type: 'material',
    screen: 'BrowserScreen',
    color: '#25D366',
    params: {
      initialUrl: 'https://web.whatsapp.com',
      initialInputUrl: 'web.whatsapp.com',
      browserMode: 'desktop',
      minimalChrome: true,
      showBottomMenu: true,
      pageTitle: 'WhatsApp Web',
    },
  },
  { id: 'contacts', name: 'Contacts', icon: 'person-circle', type: 'ionicon', screen: 'ContactsScreen', color: '#8E8E93' },
  { id: 'files', name: 'Files', icon: 'folder', type: 'ionicon', screen: 'FilesScreen', color: '#007AFF' },
  { id: 'shareapp', name: 'Share App', icon: 'share-social', type: 'ionicon', screen: 'ShareAppScreen', color: '#5856D6' },
  { id: 'calendar-freeform-slot', name: 'Calendar', icon: 'calendar', type: 'custom-calendar', screen: 'CalendarScreen', color: '#FFFFFF' },
  { id: 'appstore-journal-slot', name: 'App Store', icon: 'appstore', type: 'custom-appstore', screen: 'AppStoreScreen', color: 'transparent' },
  { id: 'settings-tips-slot', name: 'Settings', icon: 'settings', type: 'custom-settings', screen: 'SettingsScreen', color: 'transparent' },
  { id: 'gallery', name: 'Photos', icon: 'flower', type: 'custom-photos', screen: 'GalleryScreen', color: '#FFFFFF' },
  { id: 'videoplayer', name: 'Video Player', icon: 'videocam', type: 'ionicon', screen: 'VideoPlayerScreen', color: '#000000' },
];

export default function DesktopScreen({ navigation }) {
  const { addRecentApp } = useRecentApps();
  const { wallpaper } = useWallpaper();
  const { osType, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isIosSearchExpanded, setIsIosSearchExpanded] = useState(false);
  const [time, setTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [installedStoreApps, setInstalledStoreApps] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUser?.id || !currentDevice?.phoneNumber) return;

    console.log('[Desktop] unread-count API base:', API_URL);

    const loadUnreadCount = async () => {
      try {
        const response = await messageService.unreadCount({
          userId: currentUser.id,
          phoneNumber: currentDevice.phoneNumber
        });
        setUnreadCount(response.unread_count || 0);
      } catch (err) {
        console.log('Failed to load desktop unread count:', {
          apiUrl: API_URL,
          message: err?.message,
          code: err?.code,
          status: err?.response?.status,
        });
      }
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [currentUser?.id, currentDevice?.phoneNumber]);

  useEffect(() => {
    let isMounted = true;

    const loadDeviceApps = async () => {
      const apps = await loadInstalledApps({
        userId: currentUser?.id,
        deviceId: currentDevice?.id,
      });

      if (isMounted) {
        setInstalledStoreApps(apps);
      }
    };

    loadDeviceApps();

    const unsubscribe = navigation.addListener?.('focus', loadDeviceApps);

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentDevice?.id, currentUser?.id, navigation]);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const DOCK_APPS = osType === 'ios' ? DOCK_APPS_IOS : DOCK_APPS_ANDROID;
  const BASE_APPS = osType === 'ios' ? APPS_IOS : APPS_ANDROID;
  const APPS = [
    ...BASE_APPS,
    ...installedStoreApps.filter((app) => !BASE_APPS.some((baseApp) => baseApp.id === app.id)),
  ];
  const ALL_APPS = [...DOCK_APPS, ...APPS];

  const filteredApps = ALL_APPS.filter(app => 
    String(app.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const chunkArray = (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  };

  const appsPerPage = osType === 'ios' ? 16 : 16;
  const appPages = chunkArray(filteredApps, appsPerPage);
  const iosAppPages = chunkArray(APPS, 16);
  const iosSearchResults = chunkArray(
    [...DOCK_APPS, ...APPS].filter((app, index, array) => (
      array.findIndex((candidate) => candidate.id === app.id) === index
    )).filter((app) => String(app.name || '').toLowerCase().includes(searchQuery.toLowerCase())),
    16
  );

  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(contentOffsetX / Dimensions.get('window').width);
    setCurrentPage(pageIndex);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dy) > 20; // Allow slight movement before taking over
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -50) {
          if (osType === 'ios') {
            navigation.navigate('MainOS', { screen: 'RecentAppsScreen' });
          } else {
            setDrawerVisible(true);
          }
        }
      }
    })
  ).current;

  const renderAppGlyph = (app) => {
    if (app.type === 'custom-camera') {
      return (
        <View style={styles.cameraIcon}>
          <View style={styles.cameraBody}>
            <View style={styles.cameraTopBump} />
            <View style={styles.cameraLensOuter}>
              <View style={styles.cameraLensInner} />
            </View>
            <View style={styles.cameraFlashDot} />
          </View>
        </View>
      );
    }

    if (app.type === 'custom-calendar') {
      return (
        <View style={styles.calendarIcon}>
          <View style={styles.calendarTop}>
            <Text style={styles.calendarMonth}>JUL</Text>
          </View>
          <View style={styles.calendarBody}>
            <Text style={styles.calendarDate}>17</Text>
          </View>
        </View>
      );
    }

    if (app.type === 'custom-settings') {
      return <Image source={settingsIconAsset} style={styles.imageBasedIcon} resizeMode="contain" />;
    }

    if (app.type === 'custom-appstore') {
      return <Image source={appStoreIconAsset} style={styles.imageBasedIcon} resizeMode="contain" />;
    }

    if (app.type === 'custom-safari') {
      const tickMarks = Array.from({ length: 24 }, (_, index) => index);
      return (
        <View style={styles.safariIcon}>
          <LinearGradient colors={['#55d6ff', '#007aff']} style={styles.safariFace}>
            {tickMarks.map((tick) => (
              <View
                key={`${app.id}-tick-${tick}`}
                style={[
                  styles.safariTick,
                  { transform: [{ rotate: `${tick * 15}deg` }, { translateY: -14 }] }
                ]}
              />
            ))}
            <View style={[styles.safariNeedle, styles.safariNeedleRed]} />
            <View style={[styles.safariNeedle, styles.safariNeedleWhite]} />
            <View style={styles.safariCenter} />
          </LinearGradient>
        </View>
      );
    }

    if (app.type === 'custom-photos') {
      const petalColors = ['#ff5e57', '#ff9f1a', '#ffd60a', '#32d74b', '#30b0ff', '#5e5ce6', '#bf5af2', '#ff6bba'];
      return (
        <View style={styles.photosIcon}>
          {petalColors.map((color, index) => (
            <View
              key={`${app.id}-petal-${index}`}
              style={[
                styles.photosPetal,
                {
                  backgroundColor: color,
                  transform: [{ rotate: `${index * 45}deg` }, { translateY: -12 }],
                }
              ]}
            />
          ))}
          <View style={styles.photosCenter} />
        </View>
      );
    }

    if (app.type === 'remote-app') {
      return app.iconUrl ? (
        <Image source={{ uri: app.iconUrl }} style={styles.remoteAppIconImage} resizeMode="cover" />
      ) : (
        <Ionicons name="cube-outline" size={osType === 'ios' ? 28 : 32} color="#ffffff" />
      );
    }

    if (app.type === 'ionicon') {
      return (
        <Ionicons name={app.icon} size={osType === 'ios' ? 28 : 32} color={app.iconColor || "#ffffff"} />
      );
    }

    return (
      <MaterialCommunityIcons name={app.icon} size={osType === 'ios' ? 28 : 32} color={app.iconColor || "#ffffff"} />
    );
  };

  const renderAppIcon = (app, isDock = false) => (
    <TouchableOpacity 
      key={app.id} 
      style={[
        styles.appIconContainer, 
        osType === 'ios' && styles.appIconContainerIos,
        isDock && osType === 'ios' && styles.dockAppIconContainerIos
      ]} 
      onPress={() => {
        addRecentApp(app);
        setDrawerVisible(false);
        setSearchQuery('');
        setIsIosSearchExpanded(false);
        if (app.params) {
          navigation.navigate(app.screen, app.params);
        } else {
          navigation.navigate(app.screen);
        }
      }}
      activeOpacity={0.7}
    >
      <View style={[
        styles.iconWrapper, 
        { backgroundColor: app.color },
        osType === 'ios' && styles.iconWrapperIos
      ]}>
        {renderAppGlyph(app)}
        {app.name === 'Messages' && unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>
      {!(isDock && osType === 'ios') && (
        <Text style={styles.appLabel} numberOfLines={1}>{app.name}</Text>
      )}
    </TouchableOpacity>
  );

  const dockStyle = osType === 'ios' ? [styles.dock, styles.dockIos] : styles.dock;
  const showIosSearchResults = osType === 'ios' && (isIosSearchExpanded || !!searchQuery.trim());

  const renderIosSearch = (showPagination = false) => (
    <View style={[styles.paginationAndSearchContainer, showIosSearchResults && styles.paginationAndSearchContainerTop]}>
      {showPagination && !searchQuery.trim() && iosAppPages.length > 1 && (
        <View style={styles.desktopPaginationContainer}>
          {iosAppPages.map((_, index) => (
            <View key={index} style={[styles.desktopDot, currentPage === index && styles.desktopActiveDot]} />
          ))}
        </View>
      )}
      <View style={[styles.iosSearchContainer, isIosSearchExpanded && styles.iosSearchContainerExpanded]}>
        <Ionicons name="search" size={14} color="#94a3b8" />
        {isIosSearchExpanded ? (
          <>
            <TextInput
              style={styles.iosSearchInput}
              placeholder="Search apps"
              placeholderTextColor="rgba(255,255,255,0.65)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setIsIosSearchExpanded(false);
              }}
              style={styles.iosSearchCloseBtn}
            >
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.iosSearchTrigger}
            activeOpacity={0.8}
            onPress={() => setIsIosSearchExpanded(true)}
          >
            <Text style={styles.iosSearchText}>Search</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!searchQuery.trim() && iosSearchResults.length === 0 && (
        <Text style={styles.iosSearchEmptyText}>No apps found</Text>
      )}
    </View>
  );

  const Content = (
    <SafeAreaView style={styles.safeArea} {...panResponder.panHandlers}>
      {/* Status Bar Mock */}
      <View style={styles.statusBar}>
        <View style={styles.leftStatusSpacer} />
        <Text style={styles.statusText}>{formatTime(time)}</Text>
        <View style={styles.statusIcons}>
          <TouchableOpacity onPress={() => navigation.navigate('LockScreen')} style={styles.statusIconWrapper}>
            <Ionicons name="lock-closed" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('PowerOffScreen')}
            style={styles.powerBtn}
          >
            <Ionicons name="power" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {osType === 'ios' && showIosSearchResults && renderIosSearch(false)}

      {/* Desktop Workspace (Empty or Widgets) */}
      <View style={styles.desktopSpace}>
        {osType !== 'ios' && (
          <>
            <Text style={styles.desktopClock}>{formatTime(time)}</Text>
            <Text style={styles.desktopDate}>{formatDate(time)}</Text>
          </>
        )}
        {osType === 'ios' && (
           <ScrollView 
             horizontal
             pagingEnabled
             showsHorizontalScrollIndicator={false}
             style={styles.iosDesktopScroll}
             keyboardShouldPersistTaps="handled"
             onMomentumScrollEnd={handleScroll}
           >
             {(searchQuery.trim() ? iosSearchResults : iosAppPages).map((page, index) => (
               <View key={index} style={[styles.iosGrid, { width: Dimensions.get('window').width }]}>
                 {page.map(app => renderAppIcon(app, false))}
               </View>
             ))}
           </ScrollView>
        )}
      </View>

      {/* Dock Container */}
      <View style={styles.dockContainer}>
        {osType === 'ios' ? (
          !showIosSearchResults && renderIosSearch(true)
        ) : (
          <TouchableOpacity style={styles.swipeIndicator} onPress={() => setDrawerVisible(true)}>
            <Ionicons name="chevron-up" size={28} color="#ffffff" />
          </TouchableOpacity>
        )}
        
        <View style={dockStyle}>
          {DOCK_APPS.map(app => renderAppIcon(app, true))}
        </View>
      </View>

      {/* App Drawer Modal */}
      <Modal 
        visible={drawerVisible} 
        animationType="slide" 
        transparent={true}
        onRequestClose={() => setDrawerVisible(false)}
        onShow={() => setSearchQuery('')}
      >
        <TouchableOpacity 
          style={styles.drawerOverlay} 
          activeOpacity={1} 
          onPress={() => setDrawerVisible(false)}
        >
          <View style={styles.drawerSheet} onStartShouldSetResponder={() => true}>
            <LinearGradient colors={['rgba(30,41,59,0.95)', 'rgba(15,23,42,0.95)']} style={styles.drawerGradient}>
              <View style={styles.drawerHandle} />
              
              <View style={styles.drawerSearch}>
                <Ionicons name="search" size={20} color="#94a3b8" />
                <TextInput 
                  style={styles.drawerSearchInput}
                  placeholder="Search apps..."
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              <ScrollView 
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                style={{ flex: 1 }}
              >
                {appPages.map((page, index) => (
                  <View key={index} style={[styles.drawerGrid, { width: Dimensions.get('window').width }]}>
                    {page.map(app => renderAppIcon(app, false))}
                  </View>
                ))}
              </ScrollView>
              
              {appPages.length > 1 && (
                <View style={styles.paginationContainer}>
                  {appPages.map((_, index) => (
                    <View key={index} style={[styles.dot, currentPage === index && styles.activeDot]} />
                  ))}
                </View>
              )}
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bottom Navigation Bar */}
      {osType !== 'ios' && (
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

  if (wallpaper) {
    const wallpaperSource = typeof wallpaper === 'string' ? { uri: wallpaper } : wallpaper;

    return (
      <ImageBackground source={wallpaperSource} style={styles.container} resizeMode="cover">
        {Content}
      </ImageBackground>
    );
  }

  const defaultBg = ['#020713', '#003f9e', '#0088e8', '#18d7ff'];

  return (
    <LinearGradient
      colors={defaultBg}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {Content}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  statusText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconWrapper: {
    marginLeft: 16,
  },
  leftStatusSpacer: {
    width: 26,
    height: 26,
  },
  powerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  desktopSpace: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 20,
  },
  iosDesktopScroll: {
    flex: 1,
    width: '100%',
  },
  iosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingTop: 10,
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },
  iosSearchContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
    gap: 6,
    minWidth: 120,
  },
  iosSearchContainerExpanded: {
    width: Dimensions.get('window').width * 0.72,
  },
  iosSearchTrigger: {
    flex: 1,
  },
  iosSearchText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  iosSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  iosSearchCloseBtn: {
    marginLeft: 6,
  },
  iosSearchEmptyText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  paginationAndSearchContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  paginationAndSearchContainerTop: {
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  desktopPaginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  desktopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 4,
  },
  desktopActiveDot: {
    backgroundColor: '#ffffff',
  },
  desktopClock: {
    fontSize: 72,
    fontWeight: '300',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  desktopDate: {
    fontSize: 18,
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginTop: 8,
  },
  dockContainer: {
    alignItems: 'center',
    paddingBottom: 42,
  },
  swipeIndicator: {
    padding: 10,
    marginBottom: 5,
  },
  dock: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    gap: 20,
    marginBottom: 12,
  },
  dockIos: {
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 10,
    width: '90%',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  appGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    marginTop: 40,
    gap: 20,
    justifyContent: 'flex-start',
  },
  photosIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBasedIcon: {
    width: 44,
    height: 44,
  },
  remoteAppIconImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  safariIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  cameraIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBody: {
    width: 28,
    height: 19,
    borderRadius: 4,
    backgroundColor: '#1f1f1f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTopBump: {
    position: 'absolute',
    top: -3,
    left: 4,
    width: 10,
    height: 4,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: '#1f1f1f',
  },
  cameraLensOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#b9bcc4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraLensInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1f1f1f',
  },
  cameraFlashDot: {
    position: 'absolute',
    top: 5,
    right: 4,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ffd60a',
  },
  calendarIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  calendarTop: {
    height: 12,
    backgroundColor: '#ff5a52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonth: {
    color: '#ffffff',
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  calendarBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  calendarDate: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '300',
    lineHeight: 20,
  },
  safariFace: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  safariTick: {
    position: 'absolute',
    width: 1.4,
    height: 6,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  safariNeedle: {
    position: 'absolute',
    width: 3,
    height: 13,
    borderRadius: 2,
  },
  safariNeedleRed: {
    backgroundColor: '#ff3b30',
    transform: [{ rotate: '38deg' }, { translateY: -5 }],
  },
  safariNeedleWhite: {
    backgroundColor: '#ffffff',
    transform: [{ rotate: '-142deg' }, { translateY: -5 }],
  },
  safariCenter: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  photosPetal: {
    position: 'absolute',
    width: 13,
    height: 18,
    borderRadius: 9,
    opacity: 0.9,
  },
  photosCenter: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  drawerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  drawerSheet: {
    height: '85%',
  },
  drawerGradient: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  drawerSearch: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  drawerSearchInput: {
    color: '#ffffff',
    marginLeft: 10,
    fontSize: 16,
    flex: 1,
  },
  drawerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    justifyContent: 'flex-start',
  },
  appIconContainer: {
    width: '25%', // Exactly 4 columns
    alignItems: 'center',
    marginBottom: 24,
  },
  appIconContainerIos: {
    marginBottom: 20,
    paddingHorizontal: 2, // Slight padding to prevent edge overflow
  },
  dockAppIconContainerIos: {
    marginBottom: 0,
    width: 'auto',
    paddingHorizontal: 5,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30, // circular for android
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  iconWrapperIos: {
    width: 56,
    height: 56,
    borderRadius: 14, // squircle for ios
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#ffffff',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  appLabel: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
