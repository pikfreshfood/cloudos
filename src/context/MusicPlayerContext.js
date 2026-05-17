import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from './OSContext';
import { useAuth } from './AuthContext';
import { API_URL, mediaService } from '../services/api';

const MusicPlayerContext = createContext();
const MUSIC_STATE_FILE_NAME = 'music_player_state.json';
const POSITION_PERSIST_GRANULARITY_MS = 2000;
const MUSIC_MEDIA_TYPE = 'music';

const createDefaultState = () => ({
  tracks: [],
  isPlaying: false,
  progress: 0,
  duration: 0,
  position: 0,
  currentTrackIndex: -1,
  lastTrackId: null,
  isMuted: false,
  volume: 1.0,
  repeatMode: 'all',
});

export const MusicPlayerProvider = ({ children }) => {
  const { currentDeviceId, getStorageDir } = useOS();
  const { currentUser } = useAuth();
  const [statesByDevice, setStatesByDevice] = useState({});
  const playersRef = useRef({});
  const subscriptionsRef = useRef({});
  const statesRef = useRef({});
  const hydratedDevicesRef = useRef({});
  const persistRemoteMusicStateRef = useRef(async () => {});

  const configureAudioMode = useCallback(async (staysActiveInBackground = true) => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: staysActiveInBackground,
      interruptionMode: 'duckOthers',
    });
  }, []);

  useEffect(() => {
    configureAudioMode(true).catch((error) => {
      console.error('Failed to configure audio mode:', error);
    });
  }, [configureAudioMode]);

  const getDeviceState = useCallback(
    (deviceId) => statesRef.current[deviceId] || createDefaultState(),
    []
  );

  const updateDeviceState = useCallback((deviceId, updater) => {
    if (!deviceId) return;

    setStatesByDevice((prev) => {
      const currentState = prev[deviceId] || createDefaultState();
      const nextState = typeof updater === 'function'
        ? updater(currentState)
        : { ...currentState, ...updater };
      const nextMap = { ...prev, [deviceId]: nextState };
      statesRef.current = nextMap;
      return nextMap;
    });
  }, []);

  useEffect(() => {
    statesRef.current = statesByDevice;
  }, [statesByDevice]);

  const currentState = currentDeviceId
    ? statesByDevice[currentDeviceId] || createDefaultState()
    : createDefaultState();

  const getMusicStatePath = useCallback(() => {
    const storageDir = getStorageDir();
    if (!storageDir || !currentDeviceId) return '';
    return `${storageDir}${MUSIC_STATE_FILE_NAME}`;
  }, [currentDeviceId, getStorageDir]);

  const loadTrackIntoDevice = useCallback(async ({ deviceId, index, shouldPlay = true }) => {
    const deviceState = getDeviceState(deviceId);
    const track = deviceState.tracks[index];
    if (!deviceId || !track) return null;

    await configureAudioMode(true);

    let player = playersRef.current[deviceId];
    if (!player) {
      player = createAudioPlayer(null, { updateInterval: 500 });
      playersRef.current[deviceId] = player;
    }

    player.replace(track.url);
    player.muted = deviceState.isMuted;
    player.volume = deviceState.volume;
    player.loop = false;
    player.seekTo(0);

    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }

    return player;
  }, [configureAudioMode, getDeviceState]);

  const setPlaybackStatusUpdate = useCallback((deviceId, playerInstance) => {
    subscriptionsRef.current[deviceId]?.remove?.();

    subscriptionsRef.current[deviceId] = playerInstance.addListener('playbackStatusUpdate', async (status) => {
      updateDeviceState(deviceId, (prev) => ({
        ...prev,
        isPlaying: !!status.playing,
        position: Math.round((status.currentTime || 0) * 1000),
        duration: Math.round((status.duration || 0) * 1000),
        progress: status.duration ? (status.currentTime || 0) / status.duration : 0,
      }));

      if (!status.didJustFinish) return;

      const nextState = getDeviceState(deviceId);
      if (!nextState.tracks.length) return;

      if (nextState.repeatMode === 'one') {
        const targetPlayer = playersRef.current[deviceId];
        if (targetPlayer) {
          targetPlayer.seekTo(0);
          targetPlayer.play();
        }
        return;
      }

      const nextIndex = nextState.currentTrackIndex < nextState.tracks.length - 1
        ? nextState.currentTrackIndex + 1
        : 0;
      const newPlayer = await loadTrackIntoDevice({
        deviceId,
        index: nextIndex,
        shouldPlay: true,
      });
      if (!newPlayer) return;

      setPlaybackStatusUpdate(deviceId, newPlayer);
      updateDeviceState(deviceId, {
        currentTrackIndex: nextIndex,
        lastTrackId: nextState.tracks[nextIndex]?.id || null,
        isPlaying: true,
        position: 0,
        progress: 0,
      });
    });
  }, [getDeviceState, loadTrackIntoDevice, updateDeviceState]);

  const refreshTracks = useCallback(async (deviceId = currentDeviceId) => {
    if (!deviceId) return [];

    try {
      let audioFiles = [];
      const resolvedStorageDir = getStorageDir();

      if (currentUser?.id) {
        try {
          const response = await mediaService.listMusic({
            userId: currentUser.id,
            deviceId,
          });
          audioFiles = response.tracks || [];
        } catch (error) {
          console.warn(`Failed to fetch music from API at ${API_URL}; falling back to local files.`, error);
        }
      }

      if (!audioFiles.length && resolvedStorageDir) {
        const localAudioFiles = [];
        const scanDirectory = async (dirPath) => {
          const items = await FileSystem.readDirectoryAsync(dirPath);
          for (const item of items) {
            if (item.startsWith('.')) continue;

            const itemPath = `${dirPath}${item}`;
            const info = await FileSystem.getInfoAsync(itemPath);
            if (info.isDirectory) {
              await scanDirectory(`${itemPath}/`);
            } else {
              const ext = item.split('.').pop().toLowerCase();
              if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext)) {
                localAudioFiles.push({
                  id: itemPath,
                  title: item.split('.').slice(0, -1).join('.'),
                  artist: 'Local File',
                  size: info.size ? `${(info.size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown',
                  url: itemPath,
                });
              }
            }
          }
        };

        await scanDirectory(resolvedStorageDir);
        audioFiles = localAudioFiles;
      }

      updateDeviceState(deviceId, (prev) => {
        const targetTrackId = prev.lastTrackId
          || (prev.currentTrackIndex >= 0 ? prev.tracks[prev.currentTrackIndex]?.id : null);
        const restoredIndex = targetTrackId
          ? audioFiles.findIndex((track) => track.id === targetTrackId)
          : -1;
        const fallbackIndex = targetTrackId && audioFiles.length ? 0 : -1;
        const nextIndex = restoredIndex >= 0 ? restoredIndex : fallbackIndex;

        return {
          ...prev,
          tracks: audioFiles,
          currentTrackIndex: nextIndex,
          lastTrackId: nextIndex >= 0 ? audioFiles[nextIndex]?.id || null : null,
        };
      });

      return audioFiles;
    } catch (error) {
      console.error('Failed to fetch audio files:', error);
      return [];
    }
  }, [currentDeviceId, currentUser?.id, getStorageDir, updateDeviceState]);

  const playTrack = useCallback(async (index, deviceId = currentDeviceId) => {
    try {
      const player = await loadTrackIntoDevice({
        deviceId,
        index,
        shouldPlay: true,
      });
      if (!player) return;

      setPlaybackStatusUpdate(deviceId, player);
      updateDeviceState(deviceId, {
        currentTrackIndex: index,
        lastTrackId: getDeviceState(deviceId).tracks[index]?.id || null,
        isPlaying: true,
        position: 0,
        progress: 0,
      });
    } catch (error) {
      console.error('Error playing track:', error);
    }
  }, [currentDeviceId, loadTrackIntoDevice, setPlaybackStatusUpdate, updateDeviceState]);

  const togglePlayPause = useCallback(async () => {
    if (!currentDeviceId) return;

    const currentPlayer = playersRef.current[currentDeviceId];
    if (!currentPlayer) {
      const activeState = getDeviceState(currentDeviceId);
      if (activeState.tracks.length) {
        await playTrack(activeState.currentTrackIndex >= 0 ? activeState.currentTrackIndex : 0, currentDeviceId);
      }
      return;
    }

    const activeState = getDeviceState(currentDeviceId);
    if (activeState.isPlaying) {
      currentPlayer.pause();
    } else {
      currentPlayer.play();
    }
  }, [currentDeviceId, getDeviceState, playTrack]);

  const seekTo = useCallback(async (value) => {
    if (!currentDeviceId) return;
    const currentPlayer = playersRef.current[currentDeviceId];
    if (!currentPlayer) return;

    currentPlayer.seekTo(value / 1000);
    updateDeviceState(currentDeviceId, (prev) => ({
      ...prev,
      position: value,
      progress: prev.duration ? value / prev.duration : 0,
    }));
  }, [currentDeviceId, updateDeviceState]);

  const setVolumeLevel = useCallback(async (value) => {
    if (!currentDeviceId) return;

    const currentPlayer = playersRef.current[currentDeviceId];
    if (currentPlayer) {
      currentPlayer.volume = value;
      currentPlayer.muted = value === 0;
    }

    updateDeviceState(currentDeviceId, (prev) => ({
      ...prev,
      volume: value,
      isMuted: value === 0,
    }));
  }, [currentDeviceId, updateDeviceState]);

  const toggleMute = useCallback(async () => {
    if (!currentDeviceId) return;

    const activeState = getDeviceState(currentDeviceId);
    const nextMuted = !activeState.isMuted;
    const currentPlayer = playersRef.current[currentDeviceId];
    if (currentPlayer) {
      currentPlayer.muted = nextMuted;
    }

    updateDeviceState(currentDeviceId, { isMuted: nextMuted });
  }, [currentDeviceId, getDeviceState, updateDeviceState]);

  const toggleRepeatMode = useCallback(() => {
    if (!currentDeviceId) return;
    updateDeviceState(currentDeviceId, (prev) => ({
      ...prev,
      repeatMode: prev.repeatMode === 'all' ? 'one' : 'all',
    }));
  }, [currentDeviceId, updateDeviceState]);

  const playNext = useCallback(async () => {
    if (!currentDeviceId) return;
    const activeState = getDeviceState(currentDeviceId);
    if (!activeState.tracks.length) return;
    const nextIndex = activeState.currentTrackIndex < activeState.tracks.length - 1
      ? activeState.currentTrackIndex + 1
      : 0;
    await playTrack(nextIndex, currentDeviceId);
  }, [currentDeviceId, getDeviceState, playTrack]);

  const playPrevious = useCallback(async () => {
    if (!currentDeviceId) return;
    const activeState = getDeviceState(currentDeviceId);
    if (!activeState.tracks.length) return;
    const prevIndex = activeState.currentTrackIndex > 0
      ? activeState.currentTrackIndex - 1
      : activeState.tracks.length - 1;
    await playTrack(prevIndex, currentDeviceId);
  }, [currentDeviceId, getDeviceState, playTrack]);

  const stopDevicePlayback = useCallback(async (deviceId = currentDeviceId) => {
    if (!deviceId) return;

    try {
      await persistRemoteMusicStateRef.current(deviceId, { playbackStatus: 'paused' });
    } catch (error) {
      console.error('Failed to sync playback state during shutdown:', error);
    }

    const currentPlayer = playersRef.current[deviceId];
    subscriptionsRef.current[deviceId]?.remove?.();
    delete subscriptionsRef.current[deviceId];

    if (currentPlayer) {
      try {
        currentPlayer.pause();
        currentPlayer.seekTo(0);
        currentPlayer.release();
      } catch (error) {
        console.error('Failed to stop player during shutdown:', error);
      }

      delete playersRef.current[deviceId];
    }

    try {
      await configureAudioMode(false);
    } catch (error) {
      console.error('Failed to disable background audio during shutdown:', error);
    }

    updateDeviceState(deviceId, (prev) => ({
      ...prev,
      isPlaying: false,
      progress: 0,
      duration: 0,
      position: 0,
      currentTrackIndex: -1,
      lastTrackId: null,
    }));
  }, [configureAudioMode, currentDeviceId, updateDeviceState]);

  useEffect(() => {
    let cancelled = false;

    const hydrateCurrentDevice = async () => {
      if (!currentDeviceId) return;

      hydratedDevicesRef.current[currentDeviceId] = false;

      let persistedState = null;
      const musicStatePath = getMusicStatePath();
      if (musicStatePath) {
        try {
          const info = await FileSystem.getInfoAsync(musicStatePath);
          if (info.exists) {
            const content = await FileSystem.readAsStringAsync(musicStatePath);
            persistedState = JSON.parse(content);
          }
        } catch (error) {
          console.error('Failed to load saved music state:', error);
        }
      }

      if (currentUser?.id) {
        try {
          const response = await mediaService.listStates({
            userId: currentUser.id,
            mediaType: MUSIC_MEDIA_TYPE,
          });
          const latestRemoteState = response.media_states?.[0];
          if (latestRemoteState?.media_path) {
            persistedState = {
              lastTrackId: latestRemoteState.metadata?.lastTrackId || latestRemoteState.media_path,
              position: Number(latestRemoteState.position_ms) || 0,
              volume: typeof latestRemoteState.metadata?.volume === 'number' ? latestRemoteState.metadata.volume : persistedState?.volume,
              isMuted: typeof latestRemoteState.metadata?.isMuted === 'boolean' ? latestRemoteState.metadata.isMuted : persistedState?.isMuted,
              repeatMode: latestRemoteState.metadata?.repeatMode === 'one' ? 'one' : 'all',
              wasPlaying: latestRemoteState.playback_status === 'playing',
            };
          }
        } catch (error) {
          console.log('Failed to load remote music playback state:', error?.response?.data?.message || error?.message || error);
        }
      }

      if (cancelled) return;

      updateDeviceState(currentDeviceId, (prev) => ({
        ...prev,
        position: Number(persistedState?.position) || 0,
        progress: 0,
        duration: 0,
        currentTrackIndex: -1,
        lastTrackId: persistedState?.lastTrackId || null,
        isMuted: typeof persistedState?.isMuted === 'boolean' ? persistedState.isMuted : prev.isMuted,
        volume: typeof persistedState?.volume === 'number' ? persistedState.volume : prev.volume,
        repeatMode: persistedState?.repeatMode === 'one' ? 'one' : 'all',
        isPlaying: false,
      }));

      const tracks = await refreshTracks(currentDeviceId);
      if (cancelled || !tracks.length) {
        hydratedDevicesRef.current[currentDeviceId] = true;
        return;
      }

      const restoredState = getDeviceState(currentDeviceId);
      const restoredIndex = restoredState.currentTrackIndex;
      const restorePosition = Number(persistedState?.position) || 0;
      const restorePlayback = !!persistedState?.wasPlaying;

      if (restoredIndex >= 0 && restoredState.lastTrackId) {
        try {
          const player = await loadTrackIntoDevice({
            deviceId: currentDeviceId,
            index: restoredIndex,
            shouldPlay: restorePlayback,
          });

          if (player) {
            if (restorePosition > 0) {
              player.seekTo(restorePosition / 1000);
            }
            setPlaybackStatusUpdate(currentDeviceId, player);
            updateDeviceState(currentDeviceId, (prev) => ({
              ...prev,
              isPlaying: restorePlayback,
              position: restorePosition,
              progress: prev.duration ? restorePosition / prev.duration : 0,
            }));
          }
        } catch (error) {
          console.error('Failed to restore saved music session:', error);
        }
      }

      hydratedDevicesRef.current[currentDeviceId] = true;
    };

    hydrateCurrentDevice().catch(() => {
      if (currentDeviceId) {
        hydratedDevicesRef.current[currentDeviceId] = true;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentDeviceId, currentUser?.id, getDeviceState, getMusicStatePath, loadTrackIntoDevice, refreshTracks, setPlaybackStatusUpdate, updateDeviceState]);

  useEffect(() => {
    const pauseOtherDevices = async () => {
      const entries = Object.entries(playersRef.current);
      for (const [deviceId, player] of entries) {
        if (deviceId !== currentDeviceId && player) {
          try {
            player.pause();
          } catch (error) {
            console.error('Failed to pause off-device music:', error);
          }
        }
      }
    };

    pauseOtherDevices().catch(() => {});
  }, [currentDeviceId]);

  useEffect(() => () => {
    Object.values(subscriptionsRef.current).forEach((subscription) => {
      try {
        subscription?.remove?.();
      } catch (error) {
        console.error('Failed to remove music subscription:', error);
      }
    });

    Object.values(playersRef.current).forEach((player) => {
      try {
        player?.release?.();
      } catch (error) {
        console.error('Failed to remove audio player:', error);
      }
    });
  }, []);

  const currentTrack = currentState.currentTrackIndex >= 0
    ? currentState.tracks[currentState.currentTrackIndex]
    : null;

  const persistRemoteMusicState = useCallback(async (deviceId = currentDeviceId, options = {}) => {
    if (!currentUser?.id || !deviceId) return;

    const targetState = getDeviceState(deviceId);
    const targetTrack = targetState.currentTrackIndex >= 0
      ? targetState.tracks[targetState.currentTrackIndex]
      : null;
    const mediaPath = targetTrack?.path || targetTrack?.id;

    if (!mediaPath) return;

    await mediaService.saveState({
      userId: currentUser.id,
      deviceId,
      mediaType: MUSIC_MEDIA_TYPE,
      mediaPath,
      mediaTitle: targetTrack?.title || 'Music',
      positionMs: targetState.position,
      durationMs: targetState.duration,
      playbackStatus: options.playbackStatus || (targetState.isPlaying ? 'playing' : 'paused'),
      metadata: {
        lastTrackId: targetTrack?.id || targetState.lastTrackId || mediaPath,
        volume: targetState.volume,
        isMuted: targetState.isMuted,
        repeatMode: targetState.repeatMode,
      },
    });
  }, [currentDeviceId, currentUser?.id, getDeviceState]);

  useEffect(() => {
    persistRemoteMusicStateRef.current = persistRemoteMusicState;
  }, [persistRemoteMusicState]);

  const persistedPositionBucket = currentState.currentTrackIndex >= 0
    ? Math.floor(currentState.position / POSITION_PERSIST_GRANULARITY_MS) * POSITION_PERSIST_GRANULARITY_MS
    : 0;

  useEffect(() => {
    let isCancelled = false;

    const persistCurrentState = async () => {
      if (!currentDeviceId || !hydratedDevicesRef.current[currentDeviceId]) return;

      const musicStatePath = getMusicStatePath();
      if (!musicStatePath) return;

      const payload = {
        lastTrackId: currentTrack?.id || currentState.lastTrackId || null,
        position: currentState.currentTrackIndex >= 0 ? currentState.position : 0,
        volume: currentState.volume,
        isMuted: currentState.isMuted,
        repeatMode: currentState.repeatMode,
        wasPlaying: currentState.currentTrackIndex >= 0 && currentState.isPlaying,
      };

      try {
        if (!isCancelled) {
          await FileSystem.writeAsStringAsync(musicStatePath, JSON.stringify(payload));
          await persistRemoteMusicState(currentDeviceId);
        }
      } catch (error) {
        console.error('Failed to save music player state:', error);
      }
    };

    const timeoutId = setTimeout(() => {
      persistCurrentState().catch(() => {});
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    currentDeviceId,
    currentState.currentTrackIndex,
    currentState.isMuted,
    currentState.isPlaying,
    currentState.lastTrackId,
    currentState.repeatMode,
    currentState.volume,
    currentTrack?.id,
    getMusicStatePath,
    persistRemoteMusicState,
    persistedPositionBucket,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        persistRemoteMusicState(currentDeviceId).catch((error) => {
          console.log('Failed to sync playback state before app background:', error?.message || error);
        });
      }
    });

    return () => subscription.remove();
  }, [currentDeviceId, persistRemoteMusicState]);

  const value = useMemo(() => ({
    tracks: currentState.tracks,
    isPlaying: currentState.isPlaying,
    progress: currentState.progress,
    duration: currentState.duration,
    position: currentState.position,
    currentTrackIndex: currentState.currentTrackIndex,
    currentTrack,
    isMuted: currentState.isMuted,
    volume: currentState.volume,
    repeatMode: currentState.repeatMode,
    refreshTracks,
    playTrack,
    togglePlayPause,
    seekTo,
    setVolumeLevel,
    toggleMute,
    toggleRepeatMode,
    playNext,
    playPrevious,
    stopDevicePlayback,
  }), [
    currentState,
    currentTrack,
    playNext,
    playPrevious,
    playTrack,
    refreshTracks,
    seekTo,
    setVolumeLevel,
    stopDevicePlayback,
    toggleMute,
    togglePlayPause,
    toggleRepeatMode,
  ]);

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  );
};

export const useMusicPlayer = () => useContext(MusicPlayerContext);
