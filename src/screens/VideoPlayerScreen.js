import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Dimensions, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../context/AuthContext';
import { useOS } from '../context/OSContext';
import { fileService } from '../services/api';

const { width, height } = Dimensions.get('window');
const GRID_GAP = 10;
const VIDEO_CARD_WIDTH = (width - 32 - (GRID_GAP * 2)) / 3;

function VideoThumbnail({ uri }) {
  const thumbnailPlayer = useMemo(() => createVideoPlayer(null), []);

  useEffect(() => {
    try {
      thumbnailPlayer.replace(uri);
      thumbnailPlayer.currentTime = 0.1;
      thumbnailPlayer.pause();
    } catch (error) {
      console.log('Failed to load video thumbnail:', error?.message || error);
    }

    return () => {
      thumbnailPlayer.release();
    };
  }, [thumbnailPlayer, uri]);

  return (
    <VideoView
      style={styles.videoThumbnail}
      player={thumbnailPlayer}
      allowsFullscreen={false}
      nativeControls={false}
      contentFit="cover"
      pointerEvents="none"
    />
  );
}

export default function VideoPlayerScreen({ navigation }) {
  const { getStorageDir, osType, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const hasApiContext = !!currentUser?.id && !!currentDevice?.id;
  const player = useMemo(() => createVideoPlayer(null), []);
  const fullscreenPlayer = useMemo(() => createVideoPlayer(null), []);

  useEffect(() => () => {
    player.release();
    fullscreenPlayer.release();
  }, [player, fullscreenPlayer]);

  useEffect(() => {
    const handleStatusChange = ({ error }) => {
      if (!error) {
        setPlayerError('');
        return;
      }

      console.error('Video playback error:', error);
      setPlayerError('This video could not be played.');
    };

    const subscription = player.addListener('statusChange', handleStatusChange);
    const fullscreenSubscription = fullscreenPlayer.addListener('statusChange', handleStatusChange);

    return () => {
      subscription.remove();
      fullscreenSubscription.remove();
    };
  }, [player, fullscreenPlayer]);

  useFocusEffect(
    useCallback(() => {
      fetchVideoFiles();
    }, [])
  );

  const fetchVideoFiles = async () => {
    setIsLoading(true);
    try {
      const videoFiles = [];

      if (hasApiContext) {
        const collectRemoteFiles = async (folderPath = '') => {
          const response = await fileService.list({
            userId: currentUser.id,
            deviceId: currentDevice.id,
            folderPath,
          });

          for (const item of response.files || []) {
            if (item.type === 'folder') {
              const nextFolderPath = item.path
                ?.replace(`uploads/${currentUser.id}/${currentDevice.id}/`, '')
                .replace(/\\/g, '/')
                .replace(/^\/+|\/+$/g, '');
              await collectRemoteFiles(nextFolderPath);
              continue;
            }

            const ext = item.name?.split('.').pop()?.toLowerCase();
            if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
              videoFiles.push({
                id: item.id || item.path,
                title: item.name,
                size: item.size || 'Unknown',
                uri: fileService.getDownloadUrl({
                  userId: currentUser.id,
                  deviceId: currentDevice.id,
                  path: item.path,
                }),
                remotePath: item.path,
                isRemote: true,
              });
            }
          }
        };

        await collectRemoteFiles('');
      } else {
        const scanDirectory = async (dirPath) => {
          const dirInfo = await FileSystem.getInfoAsync(dirPath);
          if (!dirInfo.exists || !dirInfo.isDirectory) {
            return;
          }

          const items = await FileSystem.readDirectoryAsync(dirPath);
          for (const item of items) {
            if (item.startsWith('.')) continue;
            const itemPath = `${dirPath}${item}`;
            const info = await FileSystem.getInfoAsync(itemPath);
            if (info.isDirectory) {
              await scanDirectory(itemPath + '/');
            } else {
              const ext = item.split('.').pop().toLowerCase();
              if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
                videoFiles.push({
                  id: itemPath,
                  title: item,
                  size: info.size ? `${(info.size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown',
                  uri: itemPath,
                  remotePath: null,
                  isRemote: false,
                });
              }
            }
          }
        };

        const baseDir = getStorageDir() || '';
        if (baseDir) {
          await scanDirectory(baseDir);
        }
      }
      setVideos(videoFiles);
    } catch (error) {
      console.error('Failed to fetch video files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayVideo = (video) => {
    try {
      setPlayerError('');
      setSelectedVideo(video);
      setIsFullscreen(false);
      fullscreenPlayer.pause();
      player.loop = true;
      player.replace(video.uri);
      player.play();
    } catch (error) {
      console.error('Failed to load video:', error);
      Alert.alert('Playback error', 'This video could not be played.');
    }
  };

  const closeVideo = () => {
    player.pause();
    fullscreenPlayer.pause();
    setSelectedVideo(null);
    setIsFullscreen(false);
    setPlayerError('');
  };

  const getCurrentTime = (activePlayer) => (
    Number.isFinite(activePlayer.currentTime) ? activePlayer.currentTime : 0
  );

  const openFullscreen = () => {
    if (!selectedVideo) {
      return;
    }

    try {
      const playbackTime = getCurrentTime(player);
      const shouldContinuePlaying = player.playing;

      fullscreenPlayer.loop = true;
      fullscreenPlayer.replace(selectedVideo.uri);
      fullscreenPlayer.currentTime = playbackTime;

      player.pause();
      if (shouldContinuePlaying) {
        fullscreenPlayer.play();
      }

      setIsFullscreen(true);
    } catch (error) {
      console.error('Failed to open fullscreen video:', error);
      Alert.alert('Playback error', 'The video could not open in fullscreen.');
    }
  };

  const closeFullscreen = () => {
    try {
      const playbackTime = getCurrentTime(fullscreenPlayer);
      const shouldContinuePlaying = fullscreenPlayer.playing;

      fullscreenPlayer.pause();
      player.currentTime = playbackTime;
      if (shouldContinuePlaying) {
        player.play();
      }
    } catch (error) {
      console.error('Failed to return from fullscreen video:', error);
    } finally {
      setIsFullscreen(false);
    }
  };

  const renderVideoItem = ({ item }) => (
    <TouchableOpacity style={styles.videoItem} onPress={() => handlePlayVideo(item)}>
      <View style={styles.videoThumbnailWrap}>
        <VideoThumbnail uri={item.uri} />
        <View style={styles.videoThumbnailShade} />
        <View style={styles.videoPlayBadge}>
          <Ionicons name="play" size={13} color="#ffffff" />
        </View>
      </View>
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.videoSize}>{item.size}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video Player</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        {selectedVideo ? (
          <View style={styles.playerContainer}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerTitle} numberOfLines={1}>{selectedVideo.title}</Text>
              <TouchableOpacity onPress={closeVideo} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={28} color="#0f172a" />
              </TouchableOpacity>
            </View>
            {!isFullscreen && (
              <View style={styles.videoWrapper}>
                <VideoView
                  style={styles.video}
                  player={player}
                  allowsFullscreen={false}
                  contentFit="contain"
                  nativeControls
                />
                <TouchableOpacity style={styles.fullscreenBtn} onPress={openFullscreen}>
                  <Ionicons name="expand" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.playerInfo}>
              <Text style={styles.infoText}>Now Playing</Text>
              <Text style={styles.infoTitle}>{selectedVideo.title}</Text>
              <Text style={styles.infoSize}>Size: {selectedVideo.size}</Text>
              {!!playerError && <Text style={styles.playerError}>{playerError}</Text>}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{hasApiContext ? 'Cloud Videos' : 'Local Videos'}</Text>
              <TouchableOpacity onPress={fetchVideoFiles}>
                <Ionicons name="refresh" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <ActivityIndicator size="large" color="#f43f5e" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={videos}
                keyExtractor={item => item.id}
                renderItem={renderVideoItem}
                numColumns={3}
                columnWrapperStyle={styles.videoGridRow}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={(
                  <View style={styles.emptyState}>
                    <Ionicons name="videocam-outline" size={64} color="#cbd5e1" />
                    <Text style={styles.emptyText}>No videos found</Text>
                    <Text style={styles.emptySubText}>
                      {hasApiContext ? 'Upload videos through Files to store them in Laravel.' : 'Add videos to your device using Files'}
                    </Text>
                  </View>
                )}
              />
            )}
          </>
        )}
      </View>

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

      <Modal
        visible={isFullscreen}
        animationType="fade"
        transparent={false}
        onRequestClose={closeFullscreen}
      >
        <View style={styles.fullscreenContainer}>
          <VideoView
            style={styles.fullscreenVideo}
            player={fullscreenPlayer}
            allowsFullscreen={false}
            contentFit="contain"
            nativeControls
          />
          <TouchableOpacity style={styles.fullscreenExitBtn} onPress={closeFullscreen}>
            <Ionicons name="close" size={28} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  content: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  videoGridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  videoItem: {
    width: VIDEO_CARD_WIDTH,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  videoThumbnailWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#0f172a',
    position: 'relative',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
  },
  videoThumbnailShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.12)',
  },
  videoPlayBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(244,63,94,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfo: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 62,
  },
  videoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 15,
    marginBottom: 3,
  },
  videoSize: {
    fontSize: 10,
    color: '#64748b',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#475569',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
  },
  playerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  playerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginRight: 16,
  },
  closeBtn: {
    padding: 4,
  },
  videoWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    position: 'relative',
  },
  video: {
    width,
    height: width * (9 / 16),
    backgroundColor: '#000000',
  },
  fullscreenBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerInfo: {
    padding: 20,
    backgroundColor: '#ffffff',
  },
  infoText: {
    fontSize: 12,
    color: '#f43f5e',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  infoSize: {
    fontSize: 14,
    color: '#64748b',
  },
  playerError: {
    marginTop: 8,
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenVideo: {
    width,
    height,
    backgroundColor: '#000000',
  },
  fullscreenExitBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
