import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { STORAGE_UPGRADE_OPTIONS, formatNgn, formatStoragePlan } from '../constants/storagePlans';
import { paystackService } from '../services/api';
const EMPTY_STORAGE = { usedBytes: 0, maxBytes: 0, availableBytes: 0 };

const formatStorageAmount = (bytes) => {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.max(mb, 0).toFixed(0)} MB`;
};

export default function DashboardScreen({ navigation }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [upgradeDevice, setUpgradeDevice] = useState(null);
  const [storageSnapshots, setStorageSnapshots] = useState({});
  const { selectDevice } = useOS();
  const { currentUser, logout } = useAuth();

  const phones = useMemo(() => currentUser?.devices || [], [currentUser]);

  useEffect(() => {
    let isMounted = true;

    const loadStorageSnapshots = async () => {
      if (!currentUser?.id || !phones.length) {
        setStorageSnapshots({});
        return;
      }

      try {
        const entries = await Promise.all(
          phones.map(async (phone) => {
            const baseDir = `${FileSystem.documentDirectory}users/${currentUser.id}/devices/${phone.id}/`;
            const snapshot = await getDeviceStorageSnapshot({ baseDir, device: phone });
            return [phone.id, snapshot];
          })
        );

        if (isMounted) {
          setStorageSnapshots(Object.fromEntries(entries));
        }
      } catch (error) {
        console.error('Failed to load dashboard storage snapshots:', error);
      }
    };

    loadStorageSnapshots();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, phones]);

  const handleBootPhone = (phone) => {
    selectDevice(phone);
    navigation.navigate('BootScreen', { phone });
  };

  const handleLogout = async () => {
    await logout();
    navigation.replace('LoginScreen');
  };

  const handleCopyPhoneNumber = async () => {
    if (!currentUser?.phoneNumber) {
      Alert.alert('Unavailable', 'No phone number is available to copy yet.');
      return;
    }

    try {
      await Clipboard.setStringAsync(currentUser.phoneNumber);
      Alert.alert('Copied', `${currentUser.phoneNumber} copied to clipboard.`);
    } catch (error) {
      Alert.alert('Copy failed', 'Could not copy the phone number right now.');
    }
  };

  const handleUpgradeDevice = async (plan) => {
    if (!currentUser?.id || !upgradeDevice?.id) {
      Alert.alert('Error', 'No device selected for upgrade.');
      return;
    }

    const currentStorage = Number(upgradeDevice.storage || 0);
    if (plan.storageMb <= currentStorage) {
      Alert.alert('Already active', 'Choose a larger storage size for this device.');
      return;
    }

    try {
      const payment = await paystackService.initialize({
        email: currentUser.email,
        user_id: currentUser.id,
        device_id: upgradeDevice.id,
        device_name: upgradeDevice.name,
        storage_mb: plan.storageMb,
      });

      setUpgradeDevice(null);
      navigation.navigate('PaystackCheckoutScreen', {
        authorizationUrl: payment.authorization_url,
        reference: payment.reference,
        amountNgn: payment.amount_ngn,
        nextStorageMb: plan.storageMb,
        userId: currentUser.id,
        deviceId: upgradeDevice.id,
        deviceName: upgradeDevice.name,
      });
    } catch (error) {
      Alert.alert(
        'Payment setup failed',
        error?.response?.data?.message || error.message || 'Unable to start Paystack checkout.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Virtual Devices</Text>
          <Text style={styles.headerSubtitle}>
            {currentUser ? `${currentUser.name} controls these devices` : 'Sign in to manage your devices'}
          </Text>
        </View>
        <TouchableOpacity style={styles.profileBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={28} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {phones.map((phone) => {
          const snapshot = storageSnapshots[phone.id] || EMPTY_STORAGE;
          const storageLabel = `${formatStorageAmount(snapshot.usedBytes)} / ${formatStorageAmount(snapshot.maxBytes || Number(phone.storage || 0) * 1024 * 1024)} used`;

          return (
            <View key={phone.id} style={styles.phoneCard}>
            <View style={styles.phoneIllustration}>
              <View style={styles.screenInner}>
                <Ionicons name="cloud" size={48} color="rgba(59, 130, 246, 0.5)" />
              </View>
              <View style={styles.cameraHole} />
            </View>

            <Text style={styles.phoneName}>{phone.name}</Text>
            <Text style={styles.deviceIdText}>ID: {phone.id}</Text>
            <TouchableOpacity style={styles.phoneNumberBadge} onPress={handleCopyPhoneNumber} activeOpacity={0.8}>
              <Ionicons name="call-outline" size={14} color="#0f766e" />
              <Text style={styles.phoneNumberBadgeText}>
                {currentUser?.phoneNumber || 'No number'}
              </Text>
              <Ionicons name="copy-outline" size={16} color="#0f766e" />
            </TouchableOpacity>
            
            <View style={styles.badgesContainer}>
              <View style={styles.storageBadge}>
                <Text style={styles.storageBadgeText}>{storageLabel}</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.bootBtn}
              onPress={() => handleBootPhone(phone)}
            >
              <Text style={styles.bootBtnText}>Boot Device</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => setUpgradeDevice(phone)}
            >
              <Text style={styles.upgradeBtnText}>Upgrade Storage</Text>
            </TouchableOpacity>
            </View>
          );
        })}

        {/* Add New / Store Card */}
        <TouchableOpacity style={styles.addCard} onPress={() => setShowAddModal(true)}>
          <View style={styles.addIconContainer}>
            <Ionicons name="add" size={32} color="#94a3b8" />
          </View>
          <Text style={styles.addTitle}>User Isolated</Text>
          <Text style={styles.addSubtitle}>Each account gets its own Android and iPhone</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Upgrade Modal */}
      <Modal visible={showAddModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Device Isolation</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.planCard}>
              <Text style={styles.planName}>Fresh devices per account</Text>
              <Text style={styles.planStorage}>Android + iPhone</Text>
              <Text style={styles.planPrice}>Files, folders, wallpaper, and lock PIN stay separate per user/device.</Text>
            </View>

            <TouchableOpacity
              style={styles.purchaseBtn}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.purchaseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!upgradeDevice} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upgrade Storage</Text>
              <TouchableOpacity onPress={() => setUpgradeDevice(null)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.planName}>{upgradeDevice?.name || 'Selected device'}</Text>
            <Text style={styles.planPrice}>Current storage: {upgradeDevice?.storage || 0}MB</Text>

            <View style={styles.upgradeOptions}>
              {STORAGE_UPGRADE_OPTIONS.map((option) => {
                const disabled = option.storageMb <= Number(upgradeDevice?.storage || 0);
                return (
                  <TouchableOpacity
                    key={option.storageMb}
                    style={[styles.upgradeOptionBtn, disabled && styles.upgradeOptionBtnDisabled]}
                    disabled={disabled}
                    onPress={() => handleUpgradeDevice(option)}
                  >
                    <Text style={[styles.upgradeOptionText, disabled && styles.upgradeOptionTextDisabled]}>
                      {formatStoragePlan(option.storageMb)} - {formatNgn(option.priceNgn)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.purchaseBtn}
              onPress={() => setUpgradeDevice(null)}
            >
              <Text style={styles.purchaseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
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
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  profileBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  phoneCard: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  phoneIllustration: {
    width: 120,
    height: 220,
    backgroundColor: '#0f172a',
    borderRadius: 36,
    borderWidth: 6,
    borderColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  screenInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraHole: {
    position: 'absolute',
    top: 12,
    width: 32,
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
  },
  phoneName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
  },
  deviceIdText: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 12,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  phoneNumberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfeff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#a5f3fc',
    marginBottom: 12,
  },
  phoneNumberBadgeText: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  storageBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  storageBadgeText: {
    color: '#2563eb',
    fontSize: 10,
    fontWeight: 'bold',
  },
  freeBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  freeBadgeText: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: 'bold',
  },
  bootBtn: {
    width: '100%',
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bootBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  upgradeBtn: {
    width: '100%',
    marginTop: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  upgradeBtnText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addCard: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  addIconContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  addTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  addSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  planCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
    alignItems: 'center',
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  planStorage: {
    fontSize: 24,
    fontWeight: '900',
    color: '#3b82f6',
    marginVertical: 8,
  },
  planPrice: {
    fontSize: 14,
    color: '#64748b',
  },
  purchaseBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  purchaseBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  upgradeOptions: {
    marginTop: 20,
    gap: 12,
  },
  upgradeOptionBtn: {
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 14,
    alignItems: 'center',
  },
  upgradeOptionBtnDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  upgradeOptionText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '700',
  },
  upgradeOptionTextDisabled: {
    color: '#94a3b8',
  },
});
