import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, PanResponder, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useWallpaper } from '../context/WallpaperContext';
import { useOS } from '../context/OSContext';

const { width, height } = Dimensions.get('window');
const SLIDER_WIDTH = width * 0.8;
const BUTTON_WIDTH = 64;
const MAX_SLIDE_HORIZONTAL = SLIDER_WIDTH - BUTTON_WIDTH - 10;
const MAX_SLIDE_VERTICAL = 100;
const DEFAULT_BACKGROUND_COLORS = ['#020713', '#003f9e', '#0088e8', '#18d7ff'];

export default function PowerOffScreen({ navigation }) {
  const { wallpaper } = useWallpaper();
  const { osType } = useOS();
  const pan = useRef(new Animated.ValueXY()).current;
  const [opacityUp] = useState(new Animated.Value(1));
  const [opacityDown] = useState(new Animated.Value(1));

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (osType === 'ios') {
          let newX = gestureState.dx;
          if (newX < 0) newX = 0;
          if (newX > MAX_SLIDE_HORIZONTAL) newX = MAX_SLIDE_HORIZONTAL;
          pan.setValue({ x: newX, y: 0 });
          opacityUp.setValue(1 - (newX / MAX_SLIDE_HORIZONTAL));
        } else {
          let newY = gestureState.dy;
          if (newY < -MAX_SLIDE_VERTICAL) newY = -MAX_SLIDE_VERTICAL;
          if (newY > MAX_SLIDE_VERTICAL) newY = MAX_SLIDE_VERTICAL;
          pan.setValue({ x: 0, y: newY });

          // Fade out texts based on direction
          if (newY < 0) {
            opacityUp.setValue(1 - Math.abs(newY / MAX_SLIDE_VERTICAL));
            opacityDown.setValue(1);
          } else {
            opacityDown.setValue(1 - (newY / MAX_SLIDE_VERTICAL));
            opacityUp.setValue(1);
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (osType === 'ios') {
          if (gestureState.dx > MAX_SLIDE_HORIZONTAL * 0.8) {
            Animated.timing(pan, {
              toValue: { x: MAX_SLIDE_HORIZONTAL, y: 0 },
              duration: 100,
              useNativeDriver: false
            }).start(() => {
              navigation.replace('ShutdownScreen');
            });
          } else {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 5,
              useNativeDriver: false
            }).start();
            Animated.timing(opacityUp, { toValue: 1, duration: 200, useNativeDriver: false }).start();
          }
        } else {
          if (gestureState.dy < -MAX_SLIDE_VERTICAL * 0.7) {
            // Power off (Slide UP)
            Animated.timing(pan, {
              toValue: { x: 0, y: -MAX_SLIDE_VERTICAL },
              duration: 200,
              useNativeDriver: false
            }).start(() => {
              navigation.replace('ShutdownScreen', { mode: 'shutdown' });
            });
          } else if (gestureState.dy > MAX_SLIDE_VERTICAL * 0.7) {
            // Restart (Slide DOWN)
            Animated.timing(pan, {
              toValue: { x: 0, y: MAX_SLIDE_VERTICAL },
              duration: 200,
              useNativeDriver: false
            }).start(() => {
              navigation.replace('ShutdownScreen', { mode: 'restart' });
            });
          } else {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 5,
              useNativeDriver: false
            }).start();
            Animated.timing(opacityUp, { toValue: 1, duration: 200, useNativeDriver: false }).start();
            Animated.timing(opacityDown, { toValue: 1, duration: 200, useNativeDriver: false }).start();
          }
        }
      }
    })
  ).current;

  const renderIosSlider = () => (
    <View style={styles.topContainer}>
      <View style={styles.sliderTrack}>
        <Animated.Text style={[styles.sliderText, { opacity: opacityUp }]}>
          slide to power off
        </Animated.Text>
        <Animated.View
          style={[styles.sliderButton, { transform: [{ translateX: pan.x }] }]}
          {...panResponder.panHandlers}
        >
          <Ionicons name="power" size={32} color="#ff3b30" />
        </Animated.View>
      </View>
    </View>
  );

  const renderAndroidSlider = () => (
    <View style={styles.verticalSliderContainer}>
      <Animated.View style={[styles.powerOption, { opacity: opacityUp }]}>
        <Ionicons name="power" size={32} color="#ef4444" />
        <Text style={styles.powerOptionText}>Slide up to power off</Text>
      </Animated.View>

      <View style={styles.verticalSliderTrack}>
        <Animated.View
          style={[styles.verticalSliderButton, { transform: [{ translateY: pan.y }] }]}
          {...panResponder.panHandlers}
        >
          <Ionicons name="power" size={32} color="#ffffff" />
        </Animated.View>
      </View>

      <Animated.View style={[styles.powerOption, { opacity: opacityDown }]}>
        <Ionicons name="refresh" size={32} color="#3b82f6" />
        <Text style={styles.powerOptionText}>Slide down to restart</Text>
      </Animated.View>
    </View>
  );

  const Content = (
    <SafeAreaView style={styles.safeArea}>
      {osType === 'ios' ? renderIosSlider() : renderAndroidSlider()}

      <View style={styles.bottomContainer}>
        <TouchableOpacity 
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={32} color="#333" />
        </TouchableOpacity>
        <Text style={styles.cancelText}>Cancel</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <View style={styles.container}>
      {wallpaper ? (
        <ImageBackground source={typeof wallpaper === 'string' ? { uri: wallpaper } : wallpaper} style={styles.bgImage} blurRadius={15}>
          <View style={styles.overlay} />
          {Content}
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={DEFAULT_BACKGROUND_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bgImage}
        >
          {Content}
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
  },
  topContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 80,
    alignItems: 'center',
    width: '100%',
  },
  sliderTrack: {
    width: SLIDER_WIDTH,
    height: 74,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 37,
    justifyContent: 'center',
    padding: 5,
  },
  sliderText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '400',
  },
  sliderButton: {
    width: BUTTON_WIDTH,
    height: BUTTON_WIDTH,
    borderRadius: BUTTON_WIDTH / 2,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomContainer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  cancelButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cancelText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  verticalSliderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    gap: 40,
  },
  verticalSliderTrack: {
    width: 80,
    height: 300,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  verticalSliderButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  powerOption: {
    alignItems: 'center',
    gap: 8,
  },
  powerOptionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
