import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { WEB_BASE_URL, paystackService } from '../services/api';
import { formatNgn, formatStorageExpiry, formatStoragePlan } from '../constants/storagePlans';

export default function PaystackCheckoutScreen({ navigation, route }) {
  const { updateDeviceStorage } = useAuth();
  const handledSuccessRef = useRef(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const {
    authorizationUrl,
    reference,
    userId,
    deviceId,
    deviceName,
    nextStorageMb,
    amountNgn,
    billingPeriod,
  } = route.params || {};

  const handleVerifiedUpgrade = async () => {
    if (handledSuccessRef.current || !reference) {
      return;
    }

    handledSuccessRef.current = true;
    setIsVerifying(true);

    try {
      const verification = await paystackService.verify(reference);
      if (!verification?.verified) {
        throw new Error(verification?.message || 'Payment verification failed.');
      }

      const updated = await updateDeviceStorage({
        userId,
        deviceId,
        storage: nextStorageMb,
        storageExpiresAt: verification.storage_expires_at,
      });

      if (!updated.ok) {
        throw new Error(updated.error || 'Payment was verified, but the device upgrade could not be saved.');
      }

      Alert.alert(
        'Storage upgraded',
        `${deviceName} is now on the ${formatStoragePlan(nextStorageMb)} yearly plan until ${formatStorageExpiry(verification.storage_expires_at)}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      handledSuccessRef.current = false;
      Alert.alert('Verification failed', error.message || 'Unable to complete this payment verification.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleNavigationChange = (navState) => {
    if (navState?.url?.startsWith(`${WEB_BASE_URL}/paystack/mobile/callback`)) {
      handleVerifiedUpgrade();
    }
  };

  if (!authorizationUrl || !reference) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Payment setup incomplete</Text>
          <Text style={styles.errorText}>The Paystack checkout link could not be created.</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Paystack Checkout</Text>
          <Text style={styles.headerSubtitle}>
            {formatStoragePlan(nextStorageMb)} for {formatNgn(amountNgn)}/{billingPeriod === 'yearly' ? 'year' : 'period'}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <WebView
        source={{ uri: authorizationUrl }}
        onNavigationStateChange={handleNavigationChange}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading secure payment page...</Text>
          </View>
        )}
      />

      {isVerifying && (
        <View style={styles.verifyingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.verifyingText}>Verifying payment...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerBtn: {
    padding: 4,
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
  },
  headerSpacer: {
    width: 28,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    fontSize: 14,
    color: '#475569',
  },
  verifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  verifyingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  closeBtn: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#2563eb',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
