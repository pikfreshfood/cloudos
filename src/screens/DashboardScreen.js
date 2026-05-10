import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { STORAGE_UPGRADE_OPTIONS, formatNgn, formatStoragePlan } from '../constants/storagePlans';
import { fileService, paystackService, messageService } from '../services/api';
const EMPTY_STORAGE = { usedBytes: 0, maxBytes: 0, availableBytes: 0 };

const formatStorageAmount = (bytes) => {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.max(mb, 0).toFixed(2)} MB`;
};

export default function DashboardScreen({ navigation }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [upgradeDevice, setUpgradeDevice] = useState(null);
  const [storageSnapshots, setStorageSnapshots] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
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
            const maxBytes = Number(phone.storage || 500) * 1024 * 1024;
            
            try {
              const apiResponse = await fileService.list({
                userId: currentUser.id,
                deviceId: phone.id,
                folderPath: ''
              });
              
              if (apiResponse.used_space !== undefined) {
                return [phone.id, {
                  usedBytes: apiResponse.used_space,
                  maxBytes,
                  availableBytes: Math.max(maxBytes - apiResponse.used_space, 0)
                }];
              }
            } catch (apiError) {
              console.log(`Failed to fetch API storage for device ${phone.id}, falling back to local snapshot.`);
            }

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

    const loadUnreadCounts = async () => {
      if (!currentUser?.id || !phones.length) return;

      try {
        const entries = await Promise.all(
          phones.map(async (phone) => {
            if (!phone.phoneNumber) return [phone.id, 0];
            try {
              const response = await messageService.unreadCount({
                userId: currentUser.id,
                phoneNumber: phone.phoneNumber
              });
              return [phone.id, response.unread_count || 0];
            } catch (err) {
              return [phone.id, 0];
            }
          })
        );
        if (isMounted) {
          setUnreadCounts(Object.fromEntries(entries));
        }
      } catch (error) {
        console.error('Failed to load unread counts:', error);
      }
    };

    loadUnreadCounts();

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
          <Text style={styles.headerTitle}>My Devices</Text>
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
            
            {unreadCounts[phone.id] > 0 && (
              <View style={styles.unreadRow}>
                <Ionicons name="chatbubble-ellipses" size={16} color="#3b82f6" />
                <Text style={styles.unreadText}>
                  {unreadCounts[phone.id]} unread message{unreadCounts[phone.id] === 1 ? '' : 's'}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.devicePhoneText, { marginBottom: 0 }]}>Number: {phone.phoneNumber || 'Unavailable'}</Text>
              {phone.phoneNumber ? (
                <TouchableOpacity 
                  style={{ marginLeft: 8 }} 
                  onPress={async () => {
                    await Clipboard.setStringAsync(phone.phoneNumber);
                    Alert.alert('Copied', 'Phone number copied to clipboard.');
                  }}
                >
                  <Ionicons name="copy-outline" size={16} color="#64748b" />
                </TouchableOpacity>
              ) : null}
            </View>
            
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
    boxShadow: '0px 10px 20px rgba(15, 23, 42, 0.05)',
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
    boxShadow: '0px 10px 15px rgba(0, 0, 0, 0.3)',
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
  unreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
    gap: 6,
  },
  unreadText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  devicePhoneText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 12,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
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
    boxShadow: '0px 4px 8px rgba(37, 99, 235, 0.3)',
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
