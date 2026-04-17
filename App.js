import React from 'react';
import { View, StyleSheet, PanResponder, Dimensions, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { RecentAppsProvider } from './src/context/RecentAppsContext';
import { WallpaperProvider } from './src/context/WallpaperContext';
import { LockProvider } from './src/context/LockContext';
import { OSProvider, useOS } from './src/context/OSContext';
import { AuthProvider } from './src/context/AuthContext';
import { CallProvider } from './src/context/CallContext';
import { MusicPlayerProvider } from './src/context/MusicPlayerContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
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
import GalleryScreen from './src/screens/GalleryScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import FilesScreen from './src/screens/FilesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import RecentAppsScreen from './src/screens/RecentAppsScreen';
import AppStoreScreen from './src/screens/AppStoreScreen';
import VideoPlayerScreen from './src/screens/VideoPlayerScreen';
import PdfReaderScreen from './src/screens/PdfReaderScreen';
import WordReaderScreen from './src/screens/WordReaderScreen';
import PowerOffScreen from './src/screens/PowerOffScreen';
import PaystackCheckoutScreen from './src/screens/PaystackCheckoutScreen';

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
          navigation.navigate('RecentAppsScreen');
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
        <Tab.Screen name="GalleryScreen" component={GalleryScreen} />
        <Tab.Screen name="CalendarScreen" component={CalendarScreen} />
        <Tab.Screen name="FilesScreen" component={FilesScreen} />
        <Tab.Screen name="SettingsScreen" component={SettingsScreen} />
        <Tab.Screen name="RecentAppsScreen" component={RecentAppsScreen} />
        <Tab.Screen name="AppStoreScreen" component={AppStoreScreen} />
        <Tab.Screen name="VideoPlayerScreen" component={VideoPlayerScreen} />
        <Tab.Screen name="PdfReaderScreen" component={PdfReaderScreen} />
        <Tab.Screen name="WordReaderScreen" component={WordReaderScreen} />
      </Tab.Navigator>
      <IosHomeIndicator navigation={navigation} />
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OSProvider>
        <MusicPlayerProvider>
          <CallProvider>
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
                    <Stack.Navigator 
                      initialRouteName="LoginScreen"
                      screenOptions={{
                        headerShown: false,
                        animation: 'fade',
                      }}
                    >
                      <Stack.Screen name="LoginScreen" component={LoginScreen} />
                      <Stack.Screen name="RegisterScreen" component={RegisterScreen} />
                      <Stack.Screen name="DashboardScreen" component={DashboardScreen} />
                      <Stack.Screen name="BootScreen" component={BootScreen} />
                      <Stack.Screen name="PaystackCheckoutScreen" component={PaystackCheckoutScreen} />
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
          </CallProvider>
        </MusicPlayerProvider>
      </OSProvider>
    </AuthProvider>
  );
}
