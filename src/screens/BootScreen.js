import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOS } from '../context/OSContext';

export default function BootScreen({ navigation, route }) {
  const phone = route.params?.phone || { name: 'Cloud Phone' };
  const progressAnim = useRef(new Animated.Value(0)).current;
  const { osType } = useOS();

  useEffect(() => {
    // Start progress animation
    Animated.timing(progressAnim, {
      toValue: 100,
      duration: 5000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, // width animation doesn't support native driver
    }).start();

    // Navigate to LockScreen after 5.5s
    const timer = setTimeout(() => {
      navigation.replace('LockScreen', { phone });
    }, 5500);

    return () => clearTimeout(timer);
  }, [navigation, phone, progressAnim]);

  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 10, 30, 60, 80, 100],
    outputRange: ['0%', '10%', '45%', '70%', '90%', '100%']
  });

  if (osType === 'ios') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="logo-apple" size={80} color="#ffffff" style={{ marginBottom: 40 }} />
          <View style={[styles.progressContainer, { width: 200 }]}>
            <View style={[styles.progressBarBg, { backgroundColor: '#333333', height: 4, borderRadius: 2 }]}>
              <Animated.View style={[styles.progressBarFill, { width: widthInterpolated, backgroundColor: '#ffffff' }]} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.iconWrapper}>
            <Ionicons name="phone-portrait-outline" size={48} color="#ffffff" />
            <View style={styles.cloudIcon}>
              <Ionicons name="cloud" size={24} color="#3b82f6" />
            </View>
          </View>
          <Text style={styles.poweredText}>Powered by Android</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: widthInterpolated }]} />
          </View>
          <Text style={styles.startingText}>Starting system...</Text>
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
  cloudIcon: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 2,
  },
  poweredText: {
    color: '#64748b',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 8,
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
    backgroundColor: '#2563eb',
    borderRadius: 2,
  },
  startingText: {
    color: '#475569',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginTop: 16,
  },
});