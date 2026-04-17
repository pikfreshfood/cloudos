import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, Modal, FlatList, ActivityIndicator, Animated, PanResponder, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useOS } from '../context/OSContext';
import { useMusicPlayer } from '../context/MusicPlayerContext';
import Slider from '@react-native-community/slider';

const { width } = Dimensions.get('window');

export default function MusicScreenDevice({ navigation }) {
  const { osType } = useOS();
  const {
    tracks,
    isPlaying,
    duration,
    position,
    currentTrackIndex,
    currentTrack,
    isMuted,
    volume,
    repeatMode,
    refreshTracks,
    playTrack,
    togglePlayPause,
    seekTo,
    setVolumeLevel,
    toggleMute,
    toggleRepeatMode,
    playNext,
    playPrevious,
  } = useMusicPlayer();
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playlistSearch, setPlaylistSearch] = useState('');
  const playlistSearchInputRef = useRef(null);
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

  useEffect(() => {
    refreshTracks().catch(() => {});
  }, [refreshTracks]);

  useEffect(() => {
    if (!showPlaylist) return;

    const focusTimer = setTimeout(() => {
      playlistSearchInputRef.current?.focus();
    }, 250);

    return () => clearTimeout(focusTimer);
  }, [showPlaylist]);

  const visualizerAnim1 = useRef(new Animated.Value(10)).current;
  const visualizerAnim2 = useRef(new Animated.Value(10)).current;
  const visualizerAnim3 = useRef(new Animated.Value(10)).current;
  const visualizerAnim4 = useRef(new Animated.Value(10)).current;
  const visualizerAnim5 = useRef(new Animated.Value(10)).current;
  const visualizerAnim6 = useRef(new Animated.Value(10)).current;
  const visualizerAnim7 = useRef(new Animated.Value(10)).current;

  const startVisualizer = () => {
    const createAnim = (animValue) => Animated.loop(
      Animated.sequence([
        Animated.timing(animValue, {
          toValue: Math.random() * 50 + 20,
          duration: Math.random() * 200 + 150,
          useNativeDriver: false,
        }),
        Animated.timing(animValue, {
          toValue: 10,
          duration: Math.random() * 200 + 150,
          useNativeDriver: false,
        })
      ])
    );

    createAnim(visualizerAnim1).start();
    createAnim(visualizerAnim2).start();
    createAnim(visualizerAnim3).start();
    createAnim(visualizerAnim4).start();
    createAnim(visualizerAnim5).start();
    createAnim(visualizerAnim6).start();
    createAnim(visualizerAnim7).start();
  };

  const stopVisualizer = () => {
    visualizerAnim1.stopAnimation();
    visualizerAnim2.stopAnimation();
    visualizerAnim3.stopAnimation();
    visualizerAnim4.stopAnimation();
    visualizerAnim5.stopAnimation();
    visualizerAnim6.stopAnimation();
    visualizerAnim7.stopAnimation();

    Animated.timing(visualizerAnim1, { toValue: 10, duration: 200, useNativeDriver: false }).start();
    Animated.timing(visualizerAnim2, { toValue: 10, duration: 200, useNativeDriver: false }).start();
    Animated.timing(visualizerAnim3, { toValue: 10, duration: 200, useNativeDriver: false }).start();
    Animated.timing(visualizerAnim4, { toValue: 10, duration: 200, useNativeDriver: false }).start();
    Animated.timing(visualizerAnim5, { toValue: 10, duration: 200, useNativeDriver: false }).start();
    Animated.timing(visualizerAnim6, { toValue: 10, duration: 200, useNativeDriver: false }).start();
    Animated.timing(visualizerAnim7, { toValue: 10, duration: 200, useNativeDriver: false }).start();
  };

  useEffect(() => {
    if (isPlaying) {
      startVisualizer();
    } else {
      stopVisualizer();
    }
  }, [isPlaying]);

  const formatTime = (millis) => {
    if (!millis) return '00:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayTrack = async (index) => {
    try {
      setIsLoading(true);
      await playTrack(index);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMute = async () => {
    await toggleMute();
    setShowVolumeSlider(false);
  };

  const handleVolumeChange = async (val) => {
    await setVolumeLevel(val);
  };

  const handleSeek = async (value) => {
    await seekTo(value);
  };

  const renderPlaylistItem = ({ item, index }) => {
    const isActive = index === currentTrackIndex;
    return (
      <TouchableOpacity
        style={[styles.playlistItem, isActive && styles.playlistItemActive]}
        onPress={() => {
          handlePlayTrack(index);
          setShowPlaylist(false);
        }}
      >
        <View style={styles.playlistItemIcon}>
          <Ionicons name="musical-notes" size={24} color="#10b981" />
        </View>
        <View style={styles.playlistItemInfo}>
          <Text style={styles.playlistItemTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.playlistItemArtist}>{item.artist} | {item.size}</Text>
        </View>
        {isActive && isPlaying && (
          <Ionicons name="stats-chart" size={16} color="#10b981" />
        )}
      </TouchableOpacity>
    );
  };

  const filteredTracks = tracks.filter((item) => {
    const query = playlistSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.title} ${item.artist}`.toLowerCase().includes(query);
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
          <Ionicons name="chevron-down" size={32} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Music</Text>
        <TouchableOpacity
          onPress={() => setShowPlaylist(true)}
          style={styles.headerIconBtn}
        >
          <Ionicons name="list-outline" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.coverArtContainer}>
          <LinearGradient colors={['#0f172a', '#064e3b', '#000000']} style={styles.coverArt}>
            <Ionicons name="musical-notes" size={80} color="#34d399" style={styles.coverIcon} />
          </LinearGradient>
        </View>

        <View style={styles.trackInfo}>
          <Text style={styles.title}>{currentTrack ? currentTrack.title : 'Choose a track'}</Text>
          <Text style={styles.artist}>{currentTrack ? currentTrack.artist : 'Unknown Artist'}</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration || 1}
            value={position}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor="#10b981"
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor="#ffffff"
          />
        </View>

        <View style={styles.visualizerContainer}>
          <View style={styles.visualizerHeader}>
            <Text style={styles.visualizerTitle}>SPECTRUM ANALYSIS</Text>
            <View style={styles.visualizerStatus}>
              <View style={[styles.statusDot, isPlaying && styles.statusDotActive]} />
              <Text style={styles.statusText}>{isPlaying ? 'LIVE' : 'STANDBY'}</Text>
            </View>
          </View>
          <View style={styles.visualizerBox}>
            <View style={styles.visualizerBars}>
              <Animated.View style={[styles.visualizerBar, { height: visualizerAnim1, backgroundColor: isPlaying ? '#10b981' : '#334155' }]} />
              <Animated.View style={[styles.visualizerBar, { height: visualizerAnim2, backgroundColor: isPlaying ? '#34d399' : '#334155' }]} />
              <Animated.View style={[styles.visualizerBar, { height: visualizerAnim3, backgroundColor: isPlaying ? '#10b981' : '#334155' }]} />
              <Animated.View style={[styles.visualizerBar, { height: visualizerAnim4, backgroundColor: isPlaying ? '#059669' : '#334155' }]} />
              <Animated.View style={[styles.visualizerBar, { height: visualizerAnim5, backgroundColor: isPlaying ? '#10b981' : '#334155' }]} />
              <Animated.View style={[styles.visualizerBar, { height: visualizerAnim6, backgroundColor: isPlaying ? '#34d399' : '#334155' }]} />
              <Animated.View style={[styles.visualizerBar, { height: visualizerAnim7, backgroundColor: isPlaying ? '#10b981' : '#334155' }]} />
            </View>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtnSecondary} onPress={toggleRepeatMode}>
            <Ionicons name={repeatMode === 'one' ? 'repeat-outline' : 'repeat'} size={24} color={repeatMode === 'one' ? '#10b981' : '#94a3b8'} />
            {repeatMode === 'one' && <Text style={styles.repeatBadge}>1</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlBtnPrimary} onPress={playPrevious}>
            <Ionicons name="play-skip-back" size={32} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.playPauseBtn} onPress={togglePlayPause} disabled={isLoading}>
            <LinearGradient colors={['#10b981', '#059669']} style={styles.playPauseGradient}>
              {isLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={40} color="#ffffff" style={{ marginLeft: isPlaying ? 0 : 6 }} />
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlBtnPrimary} onPress={playNext}>
            <Ionicons name="play-skip-forward" size={32} color="#ffffff" />
          </TouchableOpacity>

          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              style={styles.controlBtnSecondary}
              onPress={() => setShowVolumeSlider(!showVolumeSlider)}
              onLongPress={handleToggleMute}
            >
              <Ionicons
                name={isMuted || volume === 0 ? 'volume-mute' : volume > 0.5 ? 'volume-high' : 'volume-low'}
                size={24}
                color={isMuted || volume === 0 ? '#ef4444' : '#94a3b8'}
              />
            </TouchableOpacity>

            {showVolumeSlider && (
              <View style={styles.volumePopover}>
                <Slider
                  style={{ width: 100, height: 40 }}
                  minimumValue={0}
                  maximumValue={1}
                  value={isMuted ? 0 : volume}
                  onValueChange={handleVolumeChange}
                  minimumTrackTintColor="#10b981"
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor="#ffffff"
                />
              </View>
            )}
          </View>
        </View>

        <Modal visible={showPlaylist} animationType="slide" transparent={true} onShow={() => playlistSearchInputRef.current?.focus()}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.playlistKeyboardWrap}
            >
            <View style={styles.playlistContainer}>
              <View style={styles.playlistHeader}>
                <View>
                  <Text style={styles.playlistHeaderTitle}>PLAY LIST</Text>
                  <Text style={styles.playlistHeaderCount}>{filteredTracks.length} tracks</Text>
                </View>
              </View>

              <View style={styles.playlistTopActions}>
                <View style={styles.playlistTopActionsSpacer} />
                <TouchableOpacity
                  onPress={() => {
                    setPlaylistSearch('');
                    setShowPlaylist(false);
                  }}
                  style={styles.closeIconBtn}
                >
                  <Ionicons name="close" size={18} color="#334155" />
                  <Text style={styles.closeIconBtnText}>Close</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.playlistSearchSection}>
                <Text style={styles.searchLabel}>Search Playlist</Text>
                <View style={styles.searchShell}>
                  <Ionicons name="search" size={18} color="#94a3b8" />
                  <TextInput
                    ref={playlistSearchInputRef}
                    style={styles.searchInput}
                    placeholder="Search music"
                    placeholderTextColor="#94a3b8"
                    value={playlistSearch}
                    onChangeText={setPlaylistSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="default"
                    blurOnSubmit={false}
                    enablesReturnKeyAutomatically={false}
                  />
                  {!!playlistSearch && (
                    <TouchableOpacity onPress={() => setPlaylistSearch('')}>
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  )}
                </View>
                {!!playlistSearch.trim() && (
                  <Text style={styles.playlistSearchMeta}>
                    Showing {filteredTracks.length} matching track{filteredTracks.length === 1 ? '' : 's'}
                  </Text>
                )}
              </View>

              <FlatList
                data={filteredTracks}
                keyExtractor={(item) => item.id}
                renderItem={renderPlaylistItem}
                contentContainerStyle={styles.playlistList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.emptySearchText}>No matching music found</Text>}
              />
            </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </ScrollView>

      {osType !== 'ios' && (
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
      )}

      {osType === 'ios' && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => navigation.navigate('RecentAppsScreen')}
          style={styles.iosHomeGestureArea}
          {...iosHomePanResponder.panHandlers}
        >
          <View style={styles.iosHomeIndicator} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  coverArtContainer: {
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 10,
  },
  coverArt: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  coverIcon: {
    opacity: 0.8,
  },
  trackInfo: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  artist: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 8,
    opacity: 0.8,
  },
  progressContainer: {
    marginTop: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  visualizerContainer: {
    marginTop: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  visualizerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  visualizerTitle: {
    color: 'rgba(16,185,129,0.8)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  visualizerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#475569',
    marginRight: 6,
  },
  statusDotActive: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  statusText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  visualizerBox: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
  },
  visualizerBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
    gap: 4,
  },
  visualizerBar: {
    width: 8,
    borderRadius: 4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 10,
  },
  controlBtnSecondary: {
    padding: 10,
  },
  controlBtnPrimary: {
    padding: 10,
  },
  playPauseBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  playPauseGradient: {
    flex: 1,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumePopover: {
    position: 'absolute',
    bottom: 50,
    right: -20,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  repeatBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    color: '#10b981',
    fontSize: 8,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  playlistContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    minHeight: '60%',
    padding: 24,
  },
  playlistKeyboardWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  playlistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  playlistTopActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  playlistTopActionsSpacer: {
    flex: 1,
  },
  playlistHeaderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  playlistHeaderCount: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
  },
  closeIconBtn: {
    minWidth: 78,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    gap: 6,
  },
  closeIconBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  searchLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playlistSearchSection: {
    marginBottom: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    marginBottom: 0,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#0f172a',
    marginLeft: 10,
  },
  playlistSearchMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  playlistList: {
    paddingBottom: 40,
  },
  emptySearchText: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14,
    marginTop: 24,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  playlistItemActive: {
    backgroundColor: '#ffffff',
    borderColor: '#10b981',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  playlistItemIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playlistItemInfo: {
    flex: 1,
  },
  playlistItemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  playlistItemArtist: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: width * 0.35,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});
