import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, PanResponder, Animated, ImageBackground, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLock } from '../context/LockContext';
import { useWallpaper } from '../context/WallpaperContext';
import { useMusicPlayer } from '../context/MusicPlayerContext';

const { height } = Dimensions.get('window');
const DEFAULT_BACKGROUND_COLORS = ['#020713', '#003f9e', '#0088e8', '#18d7ff'];
const EQUALIZER_IDLE_HEIGHTS = [8, 11, 14, 8, 11, 14, 8, 11];
const EQUALIZER_ACTIVE_HEIGHTS = [18, 30, 22, 34, 20, 32, 24, 28];

export default function LockScreen({ navigation }) {
  const [time, setTime] = useState(new Date());
  const [isSwipedUp, setIsSwipedUp] = useState(false);
  const [pin, setPin] = useState([]);
  const [pinError, setPinError] = useState('');
  const { verifyPin } = useLock();
  const { wallpaper } = useWallpaper();
  const { currentTrack, isPlaying, togglePlayPause, playNext, playPrevious, stopDevicePlayback } = useMusicPlayer();
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const equalizerBars = useRef(EQUALIZER_IDLE_HEIGHTS.map((barHeight) => new Animated.Value(barHeight))).current;
  const equalizerLoopsRef = useRef([]);
  const equalizerRunRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    equalizerRunRef.current += 1;
    const currentRun = equalizerRunRef.current;

    equalizerLoopsRef.current.forEach((animation) => animation.stop?.());
    equalizerLoopsRef.current = [];

    if (!isPlaying) {
      equalizerBars.forEach((bar, index) => {
        Animated.timing(bar, {
          toValue: EQUALIZER_IDLE_HEIGHTS[index],
          duration: 180,
          useNativeDriver: false,
        }).start();
      });
      return undefined;
    }

    const startBarPulse = (bar, index) => {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.delay(index * 80),
          Animated.timing(bar, {
            toValue: EQUALIZER_ACTIVE_HEIGHTS[index],
            duration: 130 + (index % 4) * 45,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: EQUALIZER_IDLE_HEIGHTS[index],
            duration: 120 + (index % 3) * 40,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: EQUALIZER_ACTIVE_HEIGHTS[(index + 3) % EQUALIZER_ACTIVE_HEIGHTS.length],
            duration: 150 + (index % 5) * 35,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: EQUALIZER_IDLE_HEIGHTS[(index + 5) % EQUALIZER_IDLE_HEIGHTS.length],
            duration: 140 + (index % 4) * 35,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
        ])
      );
      animation.start(() => {
        if (equalizerRunRef.current !== currentRun) {
          animation.stop?.();
        }
      });
      return animation;
    };

    equalizerLoopsRef.current = equalizerBars.map(startBarPulse);

    return () => {
      equalizerRunRef.current += 1;
      equalizerLoopsRef.current.forEach((animation) => animation.stop?.());
      equalizerLoopsRef.current = [];
    };
  }, [equalizerBars, isPlaying]);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const revealPinPad = () => {
    Animated.timing(slideAnim, {
      toValue: -height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setIsSwipedUp(true));
  };

  const handleUnlock = () => {
    if (verifyPin(pin.join(''))) {
      setPinError('');
      navigation.replace('MainOS');
    } else {
      setPin([]);
      setPinError('Wrong PIN. Try again.');
    }
  };

  useEffect(() => {
    if (pin.length === 4) {
      handleUnlock();
    }
  }, [pin]);

  const handlePinPress = (num) => {
    if (pin.length < 4) {
      setPinError('');
      setPin([...pin, num]);
    }
  };

  const handleBackspace = () => {
    setPinError('');
    setPin(pin.slice(0, -1));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy < -10;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy < 0 && !isSwipedUp) {
          slideAnim.setValue(Math.max(gestureState.dy, -height));
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -100) {
          revealPinPad();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      }
    })
  ).current;

  if (isSwipedUp) {
    const pinContent = (
      <SafeAreaView style={styles.pinContainer}>
        <Text style={styles.pinTitle}>Enter PIN</Text>
        <View style={styles.pinDots}>
          {[...Array(4)].map((_, i) => (
            <View key={i} style={[styles.pinDot, pin.length > i && styles.pinDotActive]} />
          ))}
        </View>
        {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
        <Text style={styles.pinHint}>Default PIN is 1234 unless you changed it in Settings.</Text>

        <View style={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <TouchableOpacity key={num} style={styles.keypadBtn} onPress={() => handlePinPress(num)}>
              <Text style={styles.keypadText}>{num}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.keypadBtn} onPress={handleBackspace}>
            <Ionicons name="backspace-outline" size={28} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.keypadBtn} onPress={() => handlePinPress(0)}>
            <Text style={styles.keypadText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keypadBtn} onPress={handleUnlock}>
            <Text style={styles.keypadActionText}>Enter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

    if (wallpaper) {
      const wallpaperSource = typeof wallpaper === 'string' ? { uri: wallpaper } : wallpaper;

      return (
        <ImageBackground source={wallpaperSource} style={styles.container} resizeMode="cover">
          <View style={styles.overlay}>
            {pinContent}
          </View>
        </ImageBackground>
      );
    }
    return (
      <LinearGradient
        colors={DEFAULT_BACKGROUND_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        {pinContent}
      </LinearGradient>
    );
  }

  const lockContent = (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.clockContainer}>
        <Text style={styles.timeText}>{formatTime(time)}</Text>
        <Text style={styles.dateText}>{formatDate(time)}</Text>
      </View>

      {currentTrack ? (
        <View style={styles.nowPlayingCard}>
          <View style={styles.nowPlayingHeader}>
            <View style={styles.nowPlayingHeaderInfo}>
              <Ionicons name="musical-notes" size={18} color="#34d399" />
              <Text style={styles.nowPlayingLabel}>Now Playing</Text>
            </View>
            <TouchableOpacity
              style={styles.nowPlayingCloseBtn}
              onPress={() => stopDevicePlayback()}
              accessibilityRole="button"
              accessibilityLabel="Close music player"
            >
              <Ionicons name="close" size={18} color="#e2e8f0" />
            </TouchableOpacity>
          </View>
          <View style={styles.nowPlayingBody}>
            <View style={styles.nowPlayingArtwork}>
              <Ionicons name="musical-note" size={20} color="#34d399" />
            </View>
            <View style={styles.nowPlayingTextWrap}>
              <Text style={styles.nowPlayingTitle} numberOfLines={1}>{currentTrack.title}</Text>
              <Text style={styles.nowPlayingArtist} numberOfLines={1}>{currentTrack.artist}</Text>
            </View>
          </View>
          <View style={styles.equalizerRow}>
            {equalizerBars.map((barHeight, index) => (
              <Animated.View
                key={`eq-${index}`}
                style={[
                  styles.equalizerBar,
                  { height: barHeight },
                  isPlaying && styles.equalizerBarActive,
                ]}
              />
            ))}
          </View>
          <View style={styles.nowPlayingControls}>
            <TouchableOpacity style={styles.nowPlayingBtn} onPress={playPrevious}>
              <Ionicons name="play-skip-back" size={18} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.nowPlayingBtnPrimary} onPress={togglePlayPause}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#0f172a" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.nowPlayingBtn} onPress={playNext}>
              <Ionicons name="play-skip-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.unlockArea}>
        <Ionicons name="chevron-up" size={24} color="rgba(255,255,255,0.7)" />
        <Text style={styles.unlockText}>Swipe up to unlock</Text>
        <TouchableOpacity style={styles.unlockButton} onPress={revealPinPad}>
          <Text style={styles.unlockButtonText}>Tap to enter PIN</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]} {...panResponder.panHandlers}>
      {wallpaper ? (
        <ImageBackground source={typeof wallpaper === 'string' ? { uri: wallpaper } : wallpaper} style={styles.container} resizeMode="cover">
          <View style={styles.overlay}>
            {lockContent}
          </View>
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={DEFAULT_BACKGROUND_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.container}
        >
          {lockContent}
        </LinearGradient>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pinContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  pinTitle: {
    fontSize: 20,
    color: '#ffffff',
    marginBottom: 40,
  },
  pinDots: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 18,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  pinDotActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  pinError: {
    color: '#fca5a5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  pinHint: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 28,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 300,
    gap: 20,
  },
  keypadBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadText: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: '300',
  },
  keypadActionText: {
    fontSize: 22,
    color: '#ffffff',
    fontWeight: '600',
  },
  clockContainer: {
    marginTop: '18%',
    alignItems: 'center',
  },
  nowPlayingCard: {
    width: '86%',
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  nowPlayingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  nowPlayingHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nowPlayingLabel: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  nowPlayingCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  nowPlayingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nowPlayingArtwork: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingTextWrap: {
    flex: 1,
  },
  nowPlayingTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  nowPlayingArtist: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
  },
  equalizerRow: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  equalizerBar: {
    width: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(148,163,184,0.65)',
  },
  equalizerBarActive: {
    backgroundColor: '#34d399',
  },
  nowPlayingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 12,
  },
  nowPlayingBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingBtnPrimary: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 60,
    fontWeight: '200',
    color: '#ffffff',
  },
  dateText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#cbd5e1',
    marginTop: 4,
  },
  unlockArea: {
    marginBottom: 40,
    alignItems: 'center',
    padding: 20,
  },
  unlockText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: 1,
  },
  unlockButton: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  unlockButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
