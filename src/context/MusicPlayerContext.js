import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from './OSContext';
import { useAuth } from './AuthContext';
import { mediaService } from '../services/api';

const MusicPlayerContext = createContext();

const createDefaultState = () => ({
  tracks: [],
  isPlaying: false,
  progress: 0,
  duration: 0,
  position: 0,
  currentTrackIndex: -1,
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
          console.error('Failed to fetch music from API, falling back to local files:', error);
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
        const currentTrack = prev.currentTrackIndex >= 0 ? prev.tracks[prev.currentTrackIndex] : null;
        const restoredIndex = currentTrack
          ? audioFiles.findIndex((track) => track.id === currentTrack.id)
          : -1;

        return {
          ...prev,
          tracks: audioFiles,
          currentTrackIndex: restoredIndex >= 0 ? restoredIndex : (audioFiles.length ? 0 : -1),
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
    }));
  }, [configureAudioMode, currentDeviceId, updateDeviceState]);

  useEffect(() => {
    refreshTracks().catch(() => {});
  }, [refreshTracks]);

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
