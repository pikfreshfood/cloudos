import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, PanResponder, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWallpaper } from '../context/WallpaperContext';
import { useOS } from '../context/OSContext';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = width * 0.8;
const BUTTON_WIDTH = 64;
const MAX_SLIDE = SLIDER_WIDTH - BUTTON_WIDTH - 10;

export default function PowerOffScreen({ navigation }) {
  const { wallpaper } = useWallpaper();
  const { osType } = useOS();
  const pan = useRef(new Animated.ValueXY()).current;
  const [opacity] = useState(new Animated.Value(1));

  useEffect(() => {
    if (osType !== 'ios') {
      navigation.replace('ShutdownScreen');
    }
  }, [navigation, osType]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        let newX = gestureState.dx;
        if (newX < 0) newX = 0;
        if (newX > MAX_SLIDE) newX = MAX_SLIDE;
        pan.setValue({ x: newX, y: 0 });

        // Fade out text as we slide
        opacity.setValue(1 - (newX / MAX_SLIDE));
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > MAX_SLIDE * 0.8) {
          // Slide successful
          Animated.timing(pan, {
            toValue: { x: MAX_SLIDE, y: 0 },
            duration: 100,
            useNativeDriver: false
          }).start(() => {
            navigation.replace('ShutdownScreen');
          });
        } else {
          // Slide failed, bounce back
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            useNativeDriver: false
          }).start();
          Animated.timing(opacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: false
          }).start();
        }
      }
    })
  ).current;

  const Content = (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topContainer}>
        <View style={styles.sliderTrack}>
          <Animated.Text style={[styles.sliderText, { opacity }]}>
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
        <ImageBackground source={{ uri: wallpaper }} style={styles.bgImage} blurRadius={15}>
          <View style={styles.overlay} />
          {Content}
        </ImageBackground>
      ) : (
        <View style={[styles.bgImage, { backgroundColor: '#1a1a1a' }]}>
          {Content}
        </View>
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
});
