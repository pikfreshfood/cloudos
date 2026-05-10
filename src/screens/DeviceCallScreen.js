import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { useOS } from '../context/OSContext';
import { WEB_BASE_URL } from '../services/api';

const normalizePhone = (value) => String(value || '').replace(/\D+/g, '');
const isPermissionGranted = (permission) => permission?.granted || permission?.status === 'granted';

const requestMicrophoneAccess = async () => {
  if (typeof Camera?.requestMicrophonePermissionsAsync !== 'function') {
    return { granted: true };
  }

  return Camera.requestMicrophonePermissionsAsync();
};

const requestCameraAccess = async () => {
  if (typeof Camera?.requestCameraPermissionsAsync !== 'function') {
    return { granted: true };
  }

  return Camera.requestCameraPermissionsAsync();
};

export default function DeviceCallScreen({ navigation, route }) {
  const { currentDevice } = useOS();
  const [isLoading, setIsLoading] = useState(true);
  const [hasMediaAccess, setHasMediaAccess] = useState(false);

  const callType = route?.params?.callType === 'voice' ? 'voice' : 'video';

  const callUrl = useMemo(() => {
    const localPhoneNumber = normalizePhone(currentDevice?.phoneNumber);
    const mode = route?.params?.mode || 'outgoing';
    const targetPhoneNumber = mode === 'incoming'
      ? normalizePhone(route?.params?.callerPhoneNumber)
      : normalizePhone(route?.params?.receiverPhoneNumber);

    const params = new URLSearchParams({
      mode,
      user: localPhoneNumber,
      target: targetPhoneNumber,
      call_type: callType,
    });

    return `${WEB_BASE_URL}/device-call?${params.toString()}`;
  }, [callType, currentDevice?.phoneNumber, route?.params?.callerPhoneNumber, route?.params?.mode, route?.params?.receiverPhoneNumber]);

  useEffect(() => {
    let isMounted = true;

    const requestCallMediaAccess = async () => {
      setHasMediaAccess(false);
      setIsLoading(true);

      try {
        const microphonePermission = await requestMicrophoneAccess();

        if (!isPermissionGranted(microphonePermission)) {
          Alert.alert(
            'Microphone access required',
            'Allow microphone access to start or answer voice calls.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
          return;
        }

        if (callType === 'video') {
          const cameraPermission = await requestCameraAccess();

          if (!isPermissionGranted(cameraPermission)) {
            Alert.alert(
              'Camera access required',
              'Allow camera access to start or answer video calls.',
              [{ text: 'OK', onPress: () => navigation.goBack() }],
            );
            return;
          }
        }

        if (isMounted) {
          setHasMediaAccess(true);
        }
      } catch (error) {
        Alert.alert(
          'Media access failed',
          error?.message || 'Could not request camera or microphone access.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    requestCallMediaAccess();

    return () => {
      isMounted = false;
    };
  }, [callType, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Device Call</Text>
          <Text style={styles.subtitle}>{callType === 'voice' ? 'Voice call' : 'Video call'}</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.webWrap}>
        {isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator color="#22d3ee" />
            <Text style={styles.loaderText}>Opening call...</Text>
          </View>
        ) : null}
        {hasMediaAccess ? (
          <WebView
            source={{ uri: callUrl }}
            style={styles.webview}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="prompt"
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onError={(event) => {
              setIsLoading(false);
              Alert.alert('Call page failed', event.nativeEvent?.description || 'Could not open the call page.');
            }}
            onHttpError={(event) => {
              setIsLoading(false);
              Alert.alert('Call page error', `Server returned ${event.nativeEvent?.statusCode || 'an error'}.`);
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020713',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#020713',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 3,
  },
  webWrap: {
    flex: 1,
    backgroundColor: '#020713',
  },
  webview: {
    flex: 1,
    backgroundColor: '#020713',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020713',
  },
  loaderText: {
    marginTop: 12,
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
});
