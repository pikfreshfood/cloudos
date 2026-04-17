import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, PanResponder, Animated, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLock } from '../context/LockContext';
import { useWallpaper } from '../context/WallpaperContext';
import { useMusicPlayer } from '../context/MusicPlayerContext';

const { height } = Dimensions.get('window');

export default function LockScreen({ navigation }) {
  const [time, setTime] = useState(new Date());
  const [isSwipedUp, setIsSwipedUp] = useState(false);
  const [pin, setPin] = useState([]);
  const { verifyPin } = useLock();
  const { wallpaper } = useWallpaper();
  const { currentTrack, isPlaying, togglePlayPause, playNext, playPrevious } = useMusicPlayer();
  
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const handleUnlock = () => {
    if (verifyPin(pin.join(''))) {
      navigation.replace('MainOS');
    } else {
      setPin([]);
    }
  };

  useEffect(() => {
    if (pin.length === 4) {
      handleUnlock();
    }
  }, [pin]);

  const handlePinPress = (num) => {
    if (pin.length < 4) {
      setPin([...pin, num]);
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dy) > 20;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy < 0 && !isSwipedUp) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -100) {
          Animated.timing(slideAnim, {
            toValue: -height,
            duration: 300,
            useNativeDriver: true,
          }).start(() => setIsSwipedUp(true));
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
      return (
        <ImageBackground source={{ uri: wallpaper }} style={styles.container} resizeMode="cover">
          <View style={styles.overlay}>
            {pinContent}
          </View>
        </ImageBackground>
      );
    }
    return (
      <View style={styles.container}>
        {pinContent}
      </View>
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
            <Ionicons name="musical-notes" size={18} color="#34d399" />
            <Text style={styles.nowPlayingLabel}>Now Playing</Text>
          </View>
          <Text style={styles.nowPlayingTitle} numberOfLines={1}>{currentTrack.title}</Text>
          <Text style={styles.nowPlayingArtist} numberOfLines={1}>{currentTrack.artist}</Text>
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
      </View>
    </SafeAreaView>
  );

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]} {...panResponder.panHandlers}>
      {wallpaper ? (
        <ImageBackground source={{ uri: wallpaper }} style={styles.container} resizeMode="cover">
          <View style={styles.overlay}>
            {lockContent}
          </View>
        </ImageBackground>
      ) : (
        lockContent
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
    marginBottom: 60,
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
    marginTop: '25%',
    alignItems: 'center',
  },
  nowPlayingCard: {
    width: '86%',
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  nowPlayingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  nowPlayingLabel: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  nowPlayingTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  nowPlayingArtist: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 4,
  },
  nowPlayingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 14,
  },
  nowPlayingBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingBtnPrimary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 72,
    fontWeight: '200',
    color: '#ffffff',
    letterSpacing: 2,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#cbd5e1',
    marginTop: 8,
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
});
