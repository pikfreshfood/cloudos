import React from 'react';
import { AppState, Modal, Text, TouchableOpacity, Vibration, View, StyleSheet, PanResponder, Dimensions, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { RecentAppsProvider } from './src/context/RecentAppsContext';
import { WallpaperProvider } from './src/context/WallpaperContext';
import { LockProvider } from './src/context/LockContext';
import { OSProvider, useOS } from './src/context/OSContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MusicPlayerProvider } from './src/context/MusicPlayerContext';
import { messageService, signalService } from './src/services/api';
import {
  showIncomingCallNotification,
  showMessageNotification,
} from './src/utils/pushNotifications';
import {
  getDefaultMessageToneOption,
  loadRingtoneSetting,
  resolveSoundSource,
  stopSound,
  playSound,
} from './src/utils/soundSettings';
import { upsertRecentCall } from './src/utils/callHistory';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import BootScreen from './src/screens/BootScreen';
import ShutdownScreen from './src/screens/ShutdownScreen';
import LockScreen from './src/screens/LockScreen';
import DesktopScreen from './src/screens/DesktopScreen';
import BrowserScreen from './src/screens/BrowserScreen';
import CameraScreen from './src/screens/CameraScreen';
import MusicScreen from './src/screens/MusicScreen';
import CalculatorScreen from './src/screens/CalculatorScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import GalleryScreen from './src/screens/GalleryScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import FilesScreen from './src/screens/FilesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import InstalledAppsScreen from './src/screens/InstalledAppsScreen';
import RecentAppsScreen from './src/screens/RecentAppsScreen';
import AppStoreScreen from './src/screens/AppStoreScreen';
import AppStoreDetailScreen from './src/screens/AppStoreDetailScreen';
import VideoPlayerScreen from './src/screens/VideoPlayerScreen';
import PdfReaderScreen from './src/screens/PdfReaderScreen';
import WordReaderScreen from './src/screens/WordReaderScreen';
import PowerOffScreen from './src/screens/PowerOffScreen';
import PaystackCheckoutScreen from './src/screens/PaystackCheckoutScreen';
import ShareAppScreen from './src/screens/ShareAppScreen';
import DeviceCallScreen from './src/screens/DeviceCallScreen';
import CloudStudioScreen from './src/screens/CloudStudioScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();
const IMMERSIVE_ROUTES = new Set(['BootScreen', 'LockScreen', 'MainOS', 'ShutdownScreen', 'PowerOffScreen']);

const getActiveRouteChain = (state) => {
  const chain = [];
  let currentState = state;

  while (currentState?.routes?.length) {
    const activeIndex = currentState.index ?? 0;
    const activeRoute = currentState.routes[activeIndex];

    if (!activeRoute) {
      break;
    }

    chain.push(activeRoute.name);
    currentState = activeRoute.state;
  }

  return chain;
};

const syncAndroidNavigationBar = async (routeChain) => {
  if (Platform.OS !== 'android') {
    return;
  }

  const activeRoutes = Array.isArray(routeChain) ? routeChain : [routeChain].filter(Boolean);
  const immersive =
    activeRoutes.some((routeName) => IMMERSIVE_ROUTES.has(routeName)) ||
    activeRoutes.includes('MainOS');

  try {
    await NavigationBar.setVisibilityAsync(immersive ? 'hidden' : 'visible');
    await NavigationBar.setButtonStyleAsync(immersive ? 'light' : 'dark');
  } catch (error) {
    console.error('Failed to sync Android navigation bar visibility:', error);
  }
};

function IosHomeIndicator({ navigation }) {
  const { osType } = useOS();
  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Detect upward swipes originating from the bottom
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy < -10;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -50) {
          navigation.navigate('MainOS', { screen: 'RecentAppsScreen' });
        }
      }
    })
  ).current;

  if (osType !== 'ios') return null;

  return (
    <View style={styles.indicatorContainer} {...panResponder.panHandlers}>
      <View style={styles.indicatorLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  indicatorContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 30, // Increased height to make it easier to catch the gesture
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 9999,
  },
  indicatorLine: {
    width: Dimensions.get('window').width * 0.35,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  incomingCallOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 7, 19, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  incomingCallCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 8,
    backgroundColor: '#020713',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.32)',
    padding: 24,
    alignItems: 'center',
  },
  incomingCallAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  incomingCallAvatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  incomingCallTitle: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
  },
  incomingCallNumber: {
    color: '#e0f2fe',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
  },
  incomingCallStatus: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  incomingCallActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 28,
  },
  incomingCallButton: {
    minWidth: 116,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  incomingCallDecline: {
    backgroundColor: '#ef4444',
  },
  incomingCallAnswer: {
    backgroundColor: '#22c55e',
  },
  incomingCallButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});

function MainOS({ navigation }) {
  const { currentDeviceId } = useOS();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        key={currentDeviceId || 'no-device'}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Hide the default bottom tab bar
        }}
        backBehavior="history"
      >
        <Tab.Screen name="DesktopScreen" component={DesktopScreen} />
        <Tab.Screen name="BrowserScreen" component={BrowserScreen} />
        <Tab.Screen name="CameraScreen" component={CameraScreen} />
        <Tab.Screen name="MusicScreen" component={MusicScreen} />
        <Tab.Screen name="CalculatorScreen" component={CalculatorScreen} />
        <Tab.Screen name="ContactsScreen" component={ContactsScreen} />
        <Tab.Screen name="MessagesScreen" component={MessagesScreen} />
        <Tab.Screen name="GalleryScreen" component={GalleryScreen} />
        <Tab.Screen name="CalendarScreen" component={CalendarScreen} />
        <Tab.Screen name="FilesScreen" component={FilesScreen} />
        <Tab.Screen name="SettingsScreen" component={SettingsScreen} />
        <Tab.Screen name="InstalledAppsScreen" component={InstalledAppsScreen} />
        <Tab.Screen name="RecentAppsScreen" component={RecentAppsScreen} />
        <Tab.Screen name="AppStoreScreen" component={AppStoreScreen} />
        <Tab.Screen name="AppStoreDetailScreen" component={AppStoreDetailScreen} />
        <Tab.Screen name="VideoPlayerScreen" component={VideoPlayerScreen} />
        <Tab.Screen name="PdfReaderScreen" component={PdfReaderScreen} />
        <Tab.Screen name="WordReaderScreen" component={WordReaderScreen} />
        <Tab.Screen name="CloudStudioScreen" component={CloudStudioScreen} />
        <Tab.Screen name="ShareAppScreen" component={ShareAppScreen} />
      </Tab.Navigator>
      <IosHomeIndicator navigation={navigation} />
    </View>
  );
}

function IncomingDeviceCallWatcher() {
  const { currentUser } = useAuth();
  const { currentDevice, osType } = useOS();
  const phoneNumber = currentDevice?.phoneNumber || '';
  const [incomingCall, setIncomingCall] = React.useState(null);
  const ringtonePlayerRef = React.useRef(null);
  const notifiedCallIdsRef = React.useRef(new Set());

  const stopRing = React.useCallback(() => {
    Vibration.cancel();
    stopSound(ringtonePlayerRef.current);
    ringtonePlayerRef.current = null;
  }, []);

  const answerIncomingCall = React.useCallback(() => {
    if (!incomingCall) return;

    upsertRecentCall(currentUser?.id, {
      id: `incoming-${incomingCall.id}`,
      phone_number: incomingCall.callerPhoneNumber,
      type: 'received',
      created_at: incomingCall.createdAt,
    }).catch(() => {});

    stopRing();
    setIncomingCall(null);
    navigationRef.navigate('DeviceCallScreen', {
      mode: 'incoming',
      callerPhoneNumber: incomingCall.callerPhoneNumber,
      callType: incomingCall.callType,
    });
  }, [currentUser?.id, incomingCall, stopRing]);

  const declineIncomingCall = React.useCallback(async () => {
    if (!incomingCall) return;

    stopRing();
    setIncomingCall(null);

    try {
      await signalService.send({
        senderPhoneNumber: phoneNumber,
        receiverPhoneNumber: incomingCall.callerPhoneNumber,
        type: 'hangup',
        data: { reason: 'declined', at: new Date().toISOString() },
      });
      await signalService.receive({ phoneNumber });
    } catch (error) {
      console.log('Incoming device call decline failed:', error?.message || error);
    }
  }, [incomingCall, phoneNumber, stopRing]);

  React.useEffect(() => {
    if (!incomingCall) {
      stopRing();
      return undefined;
    }

    Vibration.vibrate([0, 700, 450, 700], true);
    let cancelled = false;

    const startRingtone = async () => {
      try {
        const ringtoneSetting = await loadRingtoneSetting({
          userId: currentUser?.id,
          deviceId: currentDevice?.id,
          osType,
        });

        if (cancelled) return;

        const player = await playSound(resolveSoundSource(ringtoneSetting), { loop: true });
        if (cancelled) {
          stopSound(player);
          return;
        }
        ringtonePlayerRef.current = player;
      } catch (error) {
        console.log('Failed to play incoming call ringtone:', error?.message || error);
      }
    };

    startRingtone().catch(() => {});

    return () => {
      cancelled = true;
      stopRing();
    };
  }, [currentDevice?.id, currentUser?.id, incomingCall, osType, stopRing]);

  React.useEffect(() => {
    if (!currentUser?.id || !phoneNumber) {
      return undefined;
    }

    let active = true;

    const pollIncomingCall = async () => {
      const routeChain = navigationRef.isReady()
        ? getActiveRouteChain(navigationRef.getRootState())
        : [];

      if (routeChain?.includes('DeviceCallScreen')) {
        setIncomingCall(null);
        return;
      }

      try {
        const signals = await signalService.peek({ phoneNumber });
        if (!active || !Array.isArray(signals) || signals.length === 0) {
          return;
        }

        const latestCallSignal = [...signals]
          .reverse()
          .find((signal) => signal.type === 'offer' || signal.type === 'hangup');

        if (!latestCallSignal) {
          return;
        }

        if (latestCallSignal.type === 'hangup') {
          setIncomingCall(null);
          await signalService.receive({ phoneNumber });
          return;
        }

        const callerPhoneNumber = String(latestCallSignal.sender || '').replace(/\D+/g, '');
        let callType = 'video';
        try {
          const offerData = typeof latestCallSignal.data === 'string' ? JSON.parse(latestCallSignal.data) : latestCallSignal.data;
          callType = offerData?.callType === 'voice' ? 'voice' : 'video';
        } catch {
          callType = 'video';
        }

        setIncomingCall((current) => {
          if (current?.id === latestCallSignal.id) {
            return current;
          }

          upsertRecentCall(currentUser.id, {
            id: `incoming-${latestCallSignal.id}`,
            phone_number: callerPhoneNumber,
            type: 'missed',
            created_at: latestCallSignal.created_at || new Date().toISOString(),
          }).catch(() => {});

          if (AppState.currentState !== 'active' && !notifiedCallIdsRef.current.has(latestCallSignal.id)) {
            notifiedCallIdsRef.current.add(latestCallSignal.id);
            showIncomingCallNotification({
              callerPhoneNumber,
              callType,
            }).catch(() => {});
          }

          return {
            id: latestCallSignal.id,
            callerPhoneNumber,
            callType,
            createdAt: latestCallSignal.created_at || new Date().toISOString(),
          };
        });
      } catch (error) {
        console.log('Incoming device call poll failed:', error?.message || error);
      }
    };

    const interval = setInterval(pollIncomingCall, 2500);
    pollIncomingCall();

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, phoneNumber]);

  return (
    <Modal
      visible={!!incomingCall}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={declineIncomingCall}
    >
      <View style={styles.incomingCallOverlay}>
        <View style={styles.incomingCallCard}>
          <View style={styles.incomingCallAvatar}>
            <Text style={styles.incomingCallAvatarText}>
              {incomingCall?.callType === 'voice' ? 'Voice' : 'Video'}
            </Text>
          </View>
          <Text style={styles.incomingCallTitle}>
            Incoming {incomingCall?.callType === 'voice' ? 'Voice Call' : 'Video Call'}
          </Text>
          <Text style={styles.incomingCallNumber}>{incomingCall?.callerPhoneNumber || 'Unknown caller'}</Text>
          <Text style={styles.incomingCallStatus}>Ringing...</Text>

          <View style={styles.incomingCallActions}>
            <TouchableOpacity
              style={[styles.incomingCallButton, styles.incomingCallDecline]}
              onPress={declineIncomingCall}
              activeOpacity={0.82}
            >
              <Text style={styles.incomingCallButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.incomingCallButton, styles.incomingCallAnswer]}
              onPress={answerIncomingCall}
              activeOpacity={0.82}
            >
              <Text style={styles.incomingCallButtonText}>Answer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MessageNotificationWatcher() {
  const { currentUser } = useAuth();
  const { currentDevice } = useOS();
  const phoneNumber = currentDevice?.phoneNumber || '';
  const lastUnreadCountRef = React.useRef(null);
  const lastConversationStampRef = React.useRef('');

  React.useEffect(() => {
    if (!currentUser?.id || !phoneNumber) {
      lastUnreadCountRef.current = null;
      return undefined;
    }

    let active = true;

    const pollUnreadMessages = async () => {
      try {
        const response = await messageService.unreadCount({
          userId: currentUser.id,
          phoneNumber,
        });

        if (!active) return;

        const nextUnreadCount = Number(response?.unread_count || 0);
        const previousUnreadCount = lastUnreadCountRef.current;
        lastUnreadCountRef.current = nextUnreadCount;

        if (previousUnreadCount === null || nextUnreadCount <= previousUnreadCount) {
          return;
        }

        const routeChain = navigationRef.isReady()
          ? getActiveRouteChain(navigationRef.getRootState())
          : [];

        if (routeChain?.includes('MessagesScreen')) {
          return;
        }

        await playSound(resolveSoundSource(getDefaultMessageToneOption()));

        if (AppState.currentState !== 'active') {
          try {
            const conversationsResponse = await messageService.conversations({
              userId: currentUser.id,
              ownerPhoneNumber: phoneNumber,
            });
            const latestConversation = (conversationsResponse?.conversations || [])[0];
            const stamp = `${latestConversation?.phone_number || ''}-${latestConversation?.last_message_at || ''}-${latestConversation?.last_message || ''}`;

            if (latestConversation && stamp !== lastConversationStampRef.current) {
              lastConversationStampRef.current = stamp;
              await showMessageNotification({
                senderPhoneNumber: latestConversation.phone_number,
                title: latestConversation.name || latestConversation.phone_number,
                body: latestConversation.last_message,
              });
            }
          } catch (notificationError) {
            console.log('Failed to show local message notification:', notificationError?.message || notificationError);
          }
        }
      } catch (error) {
        console.log('Message notification poll failed:', error?.message || error);
      }
    };

    const interval = setInterval(pollUnreadMessages, 3000);
    pollUnreadMessages();

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, phoneNumber]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <OSProvider>
        <MusicPlayerProvider>
          <LockProvider>
            <WallpaperProvider>
              <RecentAppsProvider>
                  <NavigationContainer
                    ref={navigationRef}
                    onReady={() => {
                      const routeChain = getActiveRouteChain(navigationRef.getRootState()) || ['LoginScreen'];
                      syncAndroidNavigationBar(routeChain).catch(() => {});
                    }}
                    onStateChange={() => {
                      const routeChain = getActiveRouteChain(navigationRef.getRootState()) || ['LoginScreen'];
                      syncAndroidNavigationBar(routeChain).catch(() => {});
                    }}
                >
                  <StatusBar style="auto" />
                  <IncomingDeviceCallWatcher />
                  <MessageNotificationWatcher />
                    <Stack.Navigator 
                      initialRouteName="LoginScreen"
                      screenOptions={{
                        headerShown: false,
                        animation: 'fade',
                      }}
                    >
                      <Stack.Screen name="LoginScreen" component={LoginScreen} />
                      <Stack.Screen name="RegisterScreen" component={RegisterScreen} />
                      <Stack.Screen name="ForgotPasswordScreen" component={ForgotPasswordScreen} />
                      <Stack.Screen name="DashboardScreen" component={DashboardScreen} />
                      <Stack.Screen name="BootScreen" component={BootScreen} />
                      <Stack.Screen name="PaystackCheckoutScreen" component={PaystackCheckoutScreen} />
                      <Stack.Screen name="DeviceCallScreen" component={DeviceCallScreen} />
                      <Stack.Screen name="ShutdownScreen" component={ShutdownScreen} />
                      <Stack.Screen name="PowerOffScreen" component={PowerOffScreen} />
                      <Stack.Screen name="LockScreen" component={LockScreen} />
                      {/* The Main OS container which keeps apps mounted */}
                      <Stack.Screen name="MainOS" component={MainOS} />
                    </Stack.Navigator>
                  </NavigationContainer>
                </RecentAppsProvider>
              </WallpaperProvider>
            </LockProvider>
        </MusicPlayerProvider>
      </OSProvider>
    </AuthProvider>
  );
}
