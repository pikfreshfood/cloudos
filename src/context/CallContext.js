import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useAuth } from './AuthContext';
import { callService } from '../services/api';

const CallContext = createContext();
const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const formatDuration = (startedAt) => {
  if (!startedAt) return '00:00';

  const elapsedSeconds = Math.max(
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
    0
  );
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const getWebRtcModule = () => {
  if (Platform.OS === 'web' || Constants.appOwnership === 'expo') {
    return null;
  }

  try {
    return require('react-native-webrtc');
  } catch (error) {
    return null;
  }
};

export const CallProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [activeSession, setActiveSession] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [durationTick, setDurationTick] = useState(Date.now());
  const [callTransportState, setCallTransportState] = useState('idle');
  const [transportError, setTransportError] = useState('');
  const ringtoneRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const processedCandidatesRef = useRef(new Set());
  const initializingSessionRef = useRef(null);
  const webRtcModule = useMemo(() => getWebRtcModule(), []);
  const isExpoGo = Constants.appOwnership === 'expo';
  const isWebRtcSupported = !isExpoGo && !!webRtcModule?.RTCPeerConnection && !!webRtcModule?.mediaDevices;

  const resetTransportState = useCallback(() => {
    setCallTransportState('idle');
    setTransportError('');
  }, []);

  const playRingtone = useCallback(async () => {
    if (ringtoneRef.current) return;

    try {
      console.log('Ringtone would play here');
    } catch (error) {
      console.error('Failed to play ringtone:', error);
    }
  }, []);

  const stopRingtone = useCallback(async () => {
    if (ringtoneRef.current) {
      try {
        await ringtoneRef.current.stopAsync();
        await ringtoneRef.current.unloadAsync();
        ringtoneRef.current = null;
      } catch (error) {
        console.error('Failed to stop ringtone:', error);
      }
    }
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Microphone permission not granted');
      }
      return status === 'granted';
    } catch (error) {
      console.error('Failed to request microphone permission:', error);
      return false;
    }
  }, []);

  const setAudioModeForCall = useCallback(async (isCallActive) => {
    try {
      if (isCallActive) {
        await setAudioModeAsync({
          interruptionModeAndroid: 'doNotMix',
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
        });
      } else {
        await setAudioModeAsync({
          interruptionModeAndroid: 'duckOthers',
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      }
    } catch (error) {
      console.error('Failed to set audio mode:', error);
    }
  }, []);

  const cleanupPeerConnection = useCallback(async () => {
    processedCandidatesRef.current = new Set();
    initializingSessionRef.current = null;

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.close();
      } catch (error) {
        console.error('Failed to close peer connection:', error);
      } finally {
        peerConnectionRef.current = null;
      }
    }

    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (error) {
        console.error('Failed to stop local stream:', error);
      } finally {
        localStreamRef.current = null;
      }
    }

    remoteStreamRef.current = null;
    resetTransportState();
  }, [resetTransportState]);

  const refreshSession = useCallback(async () => {
    if (!currentUser?.id) {
      setActiveSession(null);
      return;
    }

    try {
      const response = await callService.current({ userId: currentUser.id });
      setActiveSession(response.session || null);
    } catch (error) {
      console.error('Failed to refresh current call session:', error);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    refreshSession().catch(() => {});
    const interval = setInterval(() => {
      refreshSession().catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [refreshSession]);

  useEffect(() => {
    const timer = setInterval(() => setDurationTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const isCallActive = !!activeSession;
    setAudioModeForCall(isCallActive);

    if (activeSession?.status === 'ringing' && activeSession?.direction === 'incoming') {
      playRingtone();
    } else {
      stopRingtone();
    }

    if (!activeSession) {
      cleanupPeerConnection().catch(() => {});
    }

    return () => {
      stopRingtone();
      if (!activeSession) {
        setAudioModeForCall(false);
      }
    };
  }, [activeSession, cleanupPeerConnection, playRingtone, setAudioModeForCall, stopRingtone]);

  const sendSignal = useCallback(async (sessionId, payload) => {
    if (!currentUser?.id || !sessionId) {
      return null;
    }

    const response = await callService.signal({
      userId: currentUser.id,
      sessionId,
      ...payload,
    });

    if (response?.session) {
      setActiveSession(response.session);
    }

    return response?.session || null;
  }, [currentUser?.id]);

  const flushRemoteCandidates = useCallback(async (sessionOverride = null) => {
    const session = sessionOverride || activeSession;
    const peerConnection = peerConnectionRef.current;

    if (!session || !peerConnection || !session.webrtc || !currentUser?.id) {
      return;
    }

    const incomingCandidates = session.direction === 'incoming'
      ? (session.webrtc.caller_ice_candidates || [])
      : (session.webrtc.callee_ice_candidates || []);

    for (const candidate of incomingCandidates) {
      const key = JSON.stringify(candidate);

      if (!candidate?.candidate || processedCandidatesRef.current.has(key)) {
        continue;
      }

      try {
        await peerConnection.addIceCandidate(new webRtcModule.RTCIceCandidate(candidate));
        processedCandidatesRef.current.add(key);
      } catch (error) {
        console.error('Failed to add remote ICE candidate:', error);
      }
    }
  }, [activeSession, currentUser?.id, webRtcModule]);

  const setupPeerConnection = useCallback(async (session, role) => {
    if (!isWebRtcSupported || !session?.id) {
      throw new Error('WebRTC audio is only available in a development build, not Expo Go.');
    }

    if (initializingSessionRef.current === `${session.id}:${role}`) {
      return peerConnectionRef.current;
    }

    initializingSessionRef.current = `${session.id}:${role}`;
    setCallTransportState(role === 'caller' ? 'calling' : 'connecting');
    setTransportError('');

    const microphoneGranted = await requestMicrophonePermission();

    if (!microphoneGranted) {
      initializingSessionRef.current = null;
      throw new Error('Microphone permission is required for cloud voice calls.');
    }

    await cleanupPeerConnection();

    const {
      RTCPeerConnection,
      RTCIceCandidate,
      RTCSessionDescription,
      MediaStream,
      mediaDevices,
    } = webRtcModule;

    const peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    peerConnectionRef.current = peerConnection;
    remoteStreamRef.current = new MediaStream();

    peerConnection.ontrack = (event) => {
      if (event.streams?.[0]) {
        remoteStreamRef.current = event.streams[0];
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(session.id, {
          iceCandidate: event.candidate.toJSON ? event.candidate.toJSON() : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        }).catch((error) => {
          console.error('Failed to send ICE candidate:', error);
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;

      if (state === 'connected') {
        setCallTransportState('connected');
        setTransportError('');
      } else if (state === 'connecting') {
        setCallTransportState('connecting');
      } else if (state === 'failed' || state === 'disconnected') {
        setCallTransportState('error');
        setTransportError('The WebRTC audio link dropped.');
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;

      if (state === 'failed') {
        setCallTransportState('error');
        setTransportError('The devices could not finish the audio handshake.');
      }
    };

    const localStream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = localStream;

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    if (role === 'caller') {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
      });
      await peerConnection.setLocalDescription(offer);
      await sendSignal(session.id, { offerSdp: offer.sdp });
    } else {
      if (!session.webrtc?.offer_sdp) {
        initializingSessionRef.current = null;
        throw new Error('The incoming call has not published its WebRTC offer yet.');
      }

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: session.webrtc.offer_sdp })
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await sendSignal(session.id, { answerSdp: answer.sdp });
    }

    await flushRemoteCandidates(session);
    initializingSessionRef.current = null;
    return peerConnection;
  }, [
    cleanupPeerConnection,
    flushRemoteCandidates,
    isWebRtcSupported,
    requestMicrophonePermission,
    sendSignal,
    webRtcModule,
  ]);

  const syncPeerConnectionFromSession = useCallback(async (session) => {
    const peerConnection = peerConnectionRef.current;

    if (!session || !peerConnection || !session.webrtc || !webRtcModule) {
      return;
    }

    const hasRemoteDescription = !!(
      peerConnection.currentRemoteDescription
      || peerConnection.remoteDescription
    );

    if (
      session.direction === 'outgoing'
      && session.webrtc.answer_sdp
      && !hasRemoteDescription
    ) {
      try {
        await peerConnection.setRemoteDescription(
          new webRtcModule.RTCSessionDescription({ type: 'answer', sdp: session.webrtc.answer_sdp })
        );
      } catch (error) {
        console.error('Failed to apply WebRTC answer:', error);
      }
    }

    await flushRemoteCandidates(session);

    if (session.status === 'active' && (peerConnection.currentRemoteDescription || peerConnection.remoteDescription)) {
      setCallTransportState('connected');
    }
  }, [flushRemoteCandidates, webRtcModule]);

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    syncPeerConnectionFromSession(activeSession).catch((error) => {
      console.error('Failed to sync peer connection from session:', error);
    });
  }, [activeSession, syncPeerConnectionFromSession]);

  const startCall = useCallback(async (phoneNumber) => {
    if (!currentUser?.id) {
      throw new Error('You must be signed in to place calls.');
    }

    if (!isWebRtcSupported) {
      Alert.alert(
        'Development build required',
        'WebRTC audio calls need a development build or native build. Expo Go cannot run react-native-webrtc.'
      );
      throw new Error('WebRTC audio is not available in Expo Go.');
    }

    setIsWorking(true);
    try {
      const response = await callService.start({
        callerUserId: currentUser.id,
        phoneNumber,
      });
      const session = response.session || null;
      setActiveSession(session);

      if (session) {
        await setupPeerConnection(session, 'caller');
      }

      return session;
    } finally {
      setIsWorking(false);
    }
  }, [currentUser?.id, isWebRtcSupported, setupPeerConnection]);

  const acceptCall = useCallback(async () => {
    if (!currentUser?.id || !activeSession?.id) return;

    if (!isWebRtcSupported) {
      Alert.alert(
        'Development build required',
        'WebRTC audio calls need a development build or native build. Expo Go cannot run react-native-webrtc.'
      );
      return;
    }

    setIsWorking(true);
    try {
      const response = await callService.accept({
        userId: currentUser.id,
        sessionId: activeSession.id,
      });
      const session = response.session || null;
      setActiveSession(session);

      if (session) {
        await setupPeerConnection(session, 'callee');
      }
    } finally {
      setIsWorking(false);
    }
  }, [activeSession?.id, currentUser?.id, isWebRtcSupported, setupPeerConnection]);

  const endCall = useCallback(async (status = 'ended') => {
    if (!currentUser?.id || !activeSession?.id) {
      setActiveSession(null);
      await cleanupPeerConnection();
      return;
    }

    setIsWorking(true);
    try {
      await callService.end({
        userId: currentUser.id,
        sessionId: activeSession.id,
        status,
      });
      setActiveSession(null);
      await cleanupPeerConnection();
      await setAudioModeForCall(false);
    } finally {
      setIsWorking(false);
    }
  }, [activeSession?.id, cleanupPeerConnection, currentUser?.id, setAudioModeForCall]);

  useEffect(() => {
    if (!currentUser?.id) {
      cleanupPeerConnection().catch(() => {});
      setActiveSession(null);
    }
  }, [cleanupPeerConnection, currentUser?.id]);

  const peer = useMemo(() => {
    if (!activeSession || !currentUser?.id) return null;
    return activeSession.direction === 'incoming' ? activeSession.caller : activeSession.callee;
  }, [activeSession, currentUser?.id]);

  const callStatusLabel = activeSession?.status === 'active'
    ? formatDuration(activeSession.answered_at || activeSession.created_at || durationTick)
    : activeSession?.direction === 'incoming'
      ? 'Incoming call'
      : 'Calling...';

  const value = useMemo(() => ({
    activeSession,
    isWorking,
    isWebRtcSupported,
    callTransportState,
    transportError,
    startCall,
    acceptCall,
    endCall,
    refreshSession,
  }), [
    acceptCall,
    activeSession,
    callTransportState,
    endCall,
    isWebRtcSupported,
    isWorking,
    refreshSession,
    startCall,
    transportError,
  ]);

  return (
    <CallContext.Provider value={value}>
      {children}

      <Modal visible={!!activeSession} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons
                name={activeSession?.status === 'active' ? 'call' : 'call-outline'}
                size={30}
                color="#10b981"
              />
            </View>
            <Text style={styles.title}>{peer?.name || 'Unknown caller'}</Text>
            <Text style={styles.number}>{peer?.phone_number || ''}</Text>
            <Text style={styles.status}>{callStatusLabel}</Text>
            <Text style={styles.transportState}>
              {transportError || (
                isWebRtcSupported
                  ? callTransportState === 'connected'
                    ? 'WebRTC audio connected'
                    : callTransportState === 'connecting'
                      ? 'Connecting audio...'
                      : callTransportState === 'calling'
                        ? 'Publishing offer...'
                        : 'Waiting for audio handshake...'
                  : 'Install a development build to enable WebRTC audio.'
              )}
            </Text>

            {isWorking ? (
              <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 16 }} />
            ) : null}

            <View style={styles.actions}>
              {activeSession?.status === 'ringing' && activeSession?.direction === 'incoming' ? (
                <TouchableOpacity style={styles.answerBtn} onPress={acceptCall}>
                  <Ionicons name="call" size={22} color="#ffffff" />
                  <Text style={styles.answerText}>Answer</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.endBtn}
                onPress={() => endCall(activeSession?.status === 'ringing' && activeSession?.direction === 'incoming' ? 'declined' : 'ended')}
              >
                <Ionicons name="call" size={22} color="#ffffff" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={styles.endText}>
                  {activeSession?.status === 'ringing' && activeSession?.direction === 'incoming' ? 'Decline' : 'End'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  number: {
    fontSize: 16,
    color: '#0f766e',
    marginTop: 6,
    letterSpacing: 1,
  },
  status: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  transportState: {
    marginTop: 8,
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  answerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
  },
  answerText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
  },
  endText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
