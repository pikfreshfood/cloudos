import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOS } from '../context/OSContext';
import { useMusicPlayer } from '../context/MusicPlayerContext';
import { useRecentApps } from '../context/RecentAppsContext';

export default function ShutdownScreen({ navigation }) {
  const { osType, currentDeviceId, clearCurrentDevice } = useOS();
  const { stopDevicePlayback } = useMusicPlayer();
  const { clearRecentAppsForDevice } = useRecentApps();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const hasShutdownRef = useRef(false);
  const shutdownOsTypeRef = useRef(osType);
  const shutdownDeviceIdRef = useRef(currentDeviceId);

  useEffect(() => {
    if (hasShutdownRef.current) {
      return undefined;
    }
    hasShutdownRef.current = true;

    const runShutdown = async () => {
      try {
        await stopDevicePlayback(shutdownDeviceIdRef.current);
      } catch (error) {
        console.error('Failed to stop device playback during shutdown:', error);
      }

      clearRecentAppsForDevice(shutdownDeviceIdRef.current);
    };

    runShutdown().catch(() => {});

    // Start progress animation
    Animated.timing(progressAnim, {
      toValue: 100,
      duration: 3000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();

    // Return to device selection after shutdown completes.
    const timer = setTimeout(() => {
      clearCurrentDevice();
      navigation.reset({
        index: 0,
        routes: [{ name: 'DashboardScreen' }],
      });
    }, 3500);

    return () => clearTimeout(timer);
  }, [clearCurrentDevice, clearRecentAppsForDevice, navigation, progressAnim, stopDevicePlayback]);

  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 10, 30, 60, 80, 100],
    outputRange: ['0%', '10%', '45%', '70%', '90%', '100%']
  });

  if (shutdownOsTypeRef.current === 'ios') {
    return (
      <View style={styles.iosContainer}>
        <Image 
          source={require('../../assets/ios_spinner.gif')} 
          style={styles.iosSpinner}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.iconWrapper}>
            <Ionicons name="power" size={48} color="#ef4444" />
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: widthInterpolated }]} />
          </View>
          <Text style={styles.startingText}>Shutting down...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  iconWrapper: {
    width: 96,
    height: 96,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 2,
  },
  startingText: {
    color: '#475569',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginTop: 16,
  },
  iosContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iosSpinner: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
  },
});
