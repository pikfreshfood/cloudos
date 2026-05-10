import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';
import Slider from '@react-native-community/slider';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { ensureDeviceHasSpace, getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { fileService } from '../services/api';

const CLICK_TONE_URI = 'data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAABAAQACQAOABQAGQAdACAAGwAWABAACgAFAAEAAAD//P/4//T/8P/t/+v/6v/r/+3/8P/0//n//QAAAA==';

export default function CameraScreen({ navigation }) {
  const { getStorageDir, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState('back');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraMode, setCameraMode] = useState('picture');
  const [zoom, setZoom] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const playClickTone = async () => {
    try {
      const player = createAudioPlayer(CLICK_TONE_URI);
      player.volume = 0.7;

      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          subscription.remove();
          player.release();
        }
      });

      player.play();
    } catch (error) {
      console.error('Failed to play click tone:', error);
    }
  };

  const ensureCameraFolder = async () => {
    const baseDir = getStorageDir() || '';
    if (!baseDir) {
      throw new Error('Storage directory unavailable');
    }

    const cameraDir = `${baseDir}Camera/`;
    const dirInfo = await FileSystem.getInfoAsync(cameraDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(cameraDir, { intermediates: true });
    }

    return cameraDir;
  };

  const ensureMediaPermissions = async () => {
    if (!permission?.granted) {
      const cameraResult = await requestPermission();
      if (!cameraResult.granted) {
        throw new Error('Camera permission not granted');
      }
    }

    if (cameraMode === 'video' && !micPermission?.granted) {
      const micResult = await requestMicPermission();
      if (!micResult.granted) {
        throw new Error('Microphone permission not granted');
      }
    }
  };

  useEffect(() => {
    ensureCameraFolder().catch((error) => {
      console.error('Failed to prepare Camera folder:', error);
    });
  }, []);

  useEffect(() => {
    let timer;

    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isRecording]);

  const assertCanPersistMedia = async (destination) => {
    const baseDir = getStorageDir() || '';
    const savedInfo = await FileSystem.getInfoAsync(destination);

    if (!savedInfo.exists) {
      throw new Error('Saved media not found in Camera folder');
    }

    const snapshot = await getDeviceStorageSnapshot({ baseDir, device: currentDevice });
    if (snapshot.usedBytes > snapshot.maxBytes) {
      await FileSystem.deleteAsync(destination, { idempotent: true });
      throw new Error('Storage full');
    }

    return savedInfo;
  };

  const uploadCapturedMedia = async ({ uri, fileName, mimeType }) => {
    if (!currentUser?.id || !currentDevice?.id) {
      throw new Error('No active account or device selected.');
    }

    await fileService.upload({
      uri,
      name: fileName,
      mimeType,
      userId: currentUser.id,
      deviceId: currentDevice.id,
      folderPath: 'Camera',
    });
  };

  const handleTakePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      await ensureMediaPermissions();
      const preCheck = await ensureDeviceHasSpace({
        baseDir: getStorageDir() || '',
        device: currentDevice,
        incomingBytes: 1,
      });
      if (!preCheck.ok) {
        throw new Error('Storage full');
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
      });

      const cameraDir = await ensureCameraFolder();
      const fileName = `IMG_${Date.now()}.jpg`;
      const destination = `${cameraDir}${fileName}`;

      await FileSystem.copyAsync({
        from: photo.uri,
        to: destination,
      });

      await assertCanPersistMedia(destination);
      
      try {
        await uploadCapturedMedia({
          uri: destination,
          fileName,
          mimeType: 'image/jpeg',
        });
        Alert.alert('Saved', `Photo saved to Cloud (Camera/${fileName})`);
      } catch (uploadError) {
        console.error('Failed to upload photo:', {
          message: uploadError?.message,
          status: uploadError?.response?.status,
          data: uploadError?.response?.data,
        });
        const reason = uploadError?.response?.data?.message || uploadError?.message || 'Upload failed';
        Alert.alert('Saved locally', `Photo saved to local Camera/${fileName}, but failed to upload to cloud. ${reason}`);
      }
    } catch (error) {
      console.error('Failed to capture photo:', error);
      if (`${error?.message || ''}`.toLowerCase().includes('storage')) {
        Alert.alert('Storage full', 'This device does not have enough free space to save the photo.');
      } else {
        Alert.alert('Error', 'Could not take photo.');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRecordVideo = async () => {
    if (!cameraRef.current || isRecording) return;

    try {
      await ensureMediaPermissions();
      const preCheck = await ensureDeviceHasSpace({
        baseDir: getStorageDir() || '',
        device: currentDevice,
        incomingBytes: 1,
      });
      if (!preCheck.ok) {
        throw new Error('Storage full');
      }

      await playClickTone();
      setIsRecording(true);
      const cameraDir = await ensureCameraFolder();
      const fileName = `VID_${Date.now()}.mp4`;
      const destination = `${cameraDir}${fileName}`;

      const video = await cameraRef.current.recordAsync({
        maxDuration: 300,
      });

      if (!video?.uri) {
        throw new Error('Video URI missing');
      }

      await FileSystem.copyAsync({
        from: video.uri,
        to: destination,
      });

      await assertCanPersistMedia(destination);

      try {
        await uploadCapturedMedia({
          uri: destination,
          fileName,
          mimeType: 'video/mp4',
        });
        Alert.alert('Saved', `Video saved to Cloud (Camera/${fileName})`);
      } catch (uploadError) {
        console.error('Failed to upload video:', {
          message: uploadError?.message,
          status: uploadError?.response?.status,
          data: uploadError?.response?.data,
        });
        const reason = uploadError?.response?.data?.message || uploadError?.message || 'Upload failed';
        Alert.alert('Saved locally', `Video saved to local Camera/${fileName}, but failed to upload to cloud. ${reason}`);
      }
    } catch (error) {
      console.error('Failed to record video:', error);
      if (`${error?.message || ''}`.toLowerCase().includes('permission')) {
        Alert.alert('Permission needed', 'Allow microphone access to record videos.');
      } else if (`${error?.message || ''}`.toLowerCase().includes('storage')) {
        Alert.alert('Storage full', 'This device does not have enough free space to save the video.');
      } else if (`${error?.message || ''}`.toLowerCase().includes('stop')) {
        // Ignore cancel-like stop messages.
      } else {
        Alert.alert('Error', 'Could not record video.');
      }
    } finally {
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      await playClickTone();
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera" size={52} color="#ffffff" />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>
            Allow camera access so we can open your phone camera and save photos into Files.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permissionBack} onPress={() => navigation.goBack()}>
            <Text style={styles.permissionBackText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        zoom={zoom}
        mode={cameraMode}
      >
        <SafeAreaView style={styles.overlay}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={26} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.modeTab, cameraMode === 'picture' && styles.modeTabActive]}
                onPress={() => !isRecording && setCameraMode('picture')}
              >
                <Text style={[styles.modeTabText, cameraMode === 'picture' && styles.modeTabTextActive]}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeTab, cameraMode === 'video' && styles.modeTabActive]}
                onPress={() => !isRecording && setCameraMode('video')}
              >
                <Text style={[styles.modeTabText, cameraMode === 'video' && styles.modeTabTextActive]}>Video</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.topButton}
              onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
            >
              <Ionicons name="camera-reverse-outline" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {cameraMode === 'video' && (
            <View style={styles.recordingStatus}>
              <View style={[styles.recordingDot, isRecording && styles.recordingDotActive]} />
              <Text style={styles.recordingTimeText}>
                {isRecording ? formatRecordingTime(recordingSeconds) : '00:00'}
              </Text>
            </View>
          )}

          <View style={styles.zoomRailWrap}>
            <Text style={styles.zoomTopLabel}>+</Text>
            <View style={styles.zoomSliderShell}>
              <Slider
                style={styles.zoomSlider}
                minimumValue={0}
                maximumValue={1}
                value={zoom}
                onValueChange={(value) => setZoom(Number(value.toFixed(2)))}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />
            </View>
            <Text style={styles.zoomBottomLabel}>-</Text>
            <Text style={styles.zoomLevelText}>{`${Math.round(100 + zoom * 100)}%`}</Text>
          </View>

          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.galleryHint}
              onPress={() => navigation.navigate('FilesScreen')}
            >
              <Ionicons name="folder-open-outline" size={22} color="#ffffff" />
              <Text style={styles.galleryHintText}>Camera folder</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureOuter}
              onPress={cameraMode === 'video' ? (isRecording ? handleStopRecording : handleRecordVideo) : handleTakePhoto}
              disabled={isCapturing}
              activeOpacity={0.85}
            >
              <View style={[styles.captureInner, cameraMode === 'video' && styles.captureInnerVideo]}>
                {isCapturing ? (
                  <ActivityIndicator color="#111111" />
                ) : cameraMode === 'video' ? (
                  <View style={[styles.videoActionIcon, isRecording && styles.videoActionIconActive]}>
                    <Ionicons
                      name={isRecording ? 'stop' : 'videocam'}
                      size={isRecording ? 18 : 22}
                      color="#ffffff"
                    />
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.flipButton}
              onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
            >
              <Ionicons name="sync-outline" size={22} color="#ffffff" />
              <Text style={styles.flipText}>{facing === 'back' ? 'Front' : 'Back'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  modeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 18,
    padding: 4,
  },
  modeTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  modeTabActive: {
    backgroundColor: '#ffffff',
  },
  modeTabText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  modeTabTextActive: {
    color: '#111111',
  },
  zoomRailWrap: {
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  recordingStatus: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginRight: 8,
  },
  recordingDotActive: {
    backgroundColor: '#ff3b30',
  },
  recordingTimeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  zoomTopLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  zoomSliderShell: {
    width: 44,
    height: 180,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomSlider: {
    width: 160,
    height: 40,
    transform: [{ rotate: '-90deg' }],
  },
  zoomBottomLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  zoomLevelText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
  },
  galleryHint: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  galleryHintText: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  captureOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  captureInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInnerVideo: {
    backgroundColor: '#ffffff',
  },
  videoActionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoActionIconActive: {
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  flipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  flipText: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  permissionContent: {
    alignItems: 'center',
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 18,
  },
  permissionText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#0a84ff',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionBack: {
    marginTop: 16,
    padding: 8,
  },
  permissionBackText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
