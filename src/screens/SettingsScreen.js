import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLock } from '../context/LockContext';
import { useOS } from '../context/OSContext';
import { useWallpaper } from '../context/WallpaperContext';
import { useAuth } from '../context/AuthContext';
import { getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { STORAGE_UPGRADE_OPTIONS, formatNgn, formatStoragePlan } from '../constants/storagePlans';
import { paystackService } from '../services/api';

const formatStorageValue = (bytes) => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.max(bytes / (1024 * 1024), 0).toFixed(0)} MB`;
};

export default function SettingsScreen({ navigation }) {
  const { verifyPin, updatePin } = useLock();
  const { osType, currentDevice, getStorageDir } = useOS();
  const { resetWallpaper } = useWallpaper();
  const { currentUser } = useAuth();
  
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [displayModalVisible, setDisplayModalVisible] = useState(false);
  const [storageModalVisible, setStorageModalVisible] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [storageSnapshot, setStorageSnapshot] = useState({
    usedBytes: 0,
    maxBytes: 0,
    availableBytes: 0,
  });
  const [step, setStep] = useState(1); // 1: Verify current, 2: Enter new, 3: Confirm new

  const handleSecurityPress = () => {
    setStep(1);
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setSecurityModalVisible(true);
  };

  const handleDisplayPress = () => {
    setDisplayModalVisible(true);
  };

  const refreshStorageSnapshot = async () => {
    if (!currentDevice) {
      setStorageSnapshot({ usedBytes: 0, maxBytes: 0, availableBytes: 0 });
      return;
    }

    try {
      const snapshot = await getDeviceStorageSnapshot({
        baseDir: getStorageDir(),
        device: currentDevice,
      });
      setStorageSnapshot(snapshot);
    } catch (error) {
      console.error('Failed to load storage snapshot:', error);
    }
  };

  useEffect(() => {
    refreshStorageSnapshot();
  }, [currentDevice?.id, currentDevice?.storage]);

  const handleResetBackground = async () => {
    await resetWallpaper();
    setDisplayModalVisible(false);
    Alert.alert('Success', 'Background reset to default');
  };

  const handleVerifyCurrentPin = () => {
    if (verifyPin(currentPinInput)) {
      setStep(2);
    } else {
      Alert.alert('Error', 'Incorrect current PIN');
      setCurrentPinInput('');
    }
  };

  const handleNextStep = () => {
    if (newPinInput.length !== 4) {
      Alert.alert('Error', 'PIN must be exactly 4 digits');
      return;
    }
    setStep(3);
  };

  const handleConfirmNewPin = async () => {
    if (confirmPinInput !== newPinInput) {
      Alert.alert('Error', 'PINs do not match');
      setConfirmPinInput('');
      return;
    }
    const success = await updatePin(newPinInput);
    if (success) {
      Alert.alert('Success', 'PIN updated successfully');
      setSecurityModalVisible(false);
    } else {
      Alert.alert('Error', 'Failed to update PIN');
    }
  };

  const handleUpgradeStorage = async (plan) => {
    if (!currentUser?.id || !currentDevice?.id) {
      Alert.alert('Error', 'No active device selected.');
      return;
    }

    const currentStorageMb = Number(currentDevice.storage || 0);
    if (plan.storageMb <= currentStorageMb) {
      Alert.alert('Storage already upgraded', 'Choose a larger storage size for this device.');
      return;
    }

    try {
      const payment = await paystackService.initialize({
        email: currentUser.email,
        user_id: currentUser.id,
        device_id: currentDevice.id,
        device_name: currentDevice.name,
        storage_mb: plan.storageMb,
      });

      setStorageModalVisible(false);
      navigation.navigate('PaystackCheckoutScreen', {
        authorizationUrl: payment.authorization_url,
        reference: payment.reference,
        amountNgn: payment.amount_ngn,
        nextStorageMb: plan.storageMb,
        userId: currentUser.id,
        deviceId: currentDevice.id,
        deviceName: currentDevice.name,
      });
    } catch (error) {
      Alert.alert(
        'Payment setup failed',
        error?.response?.data?.message || error.message || 'Unable to start Paystack checkout.'
      );
    }
  };

  const storageLabel = useMemo(() => {
    if (!currentDevice) return 'Unavailable';
    return `${formatStorageValue(storageSnapshot.usedBytes)} of ${currentDevice.storage} MB used`;
  }, [currentDevice, storageSnapshot.usedBytes]);

  const settingsGroups = [
    {
      title: 'Connections',
      items: [
        { id: 'wifi', name: 'Wi-Fi', icon: 'wifi', color: '#3b82f6', value: 'Connected' },
        { id: 'bluetooth', name: 'Bluetooth', icon: 'bluetooth', color: '#8b5cf6', value: 'On' },
      ],
    },
    {
      title: 'Device',
      items: [
        { id: 'display', name: 'Display', icon: 'sunny', color: '#f59e0b' },
        { id: 'sound', name: 'Sound & Vibration', icon: 'volume-high', color: '#10b981' },
        { id: 'storage', name: 'Storage', icon: 'server', color: '#6366f1', value: storageLabel },
        { id: 'upgrade-storage', name: 'Upgrade Storage', icon: 'rocket', color: '#8b5cf6', value: `${currentDevice?.storage || 0} MB` },
        { id: 'battery', name: 'Battery', icon: 'battery-full', color: '#14b8a6', value: '100%' },
      ],
    },
    {
      title: 'Personal',
      items: [
        { id: 'security', name: 'Security', icon: 'lock-closed', color: '#ef4444' },
        { id: 'accounts', name: 'Accounts', icon: 'person', color: '#0ea5e9' },
      ],
    },
  ];

  return (
    <SafeAreaView style={[styles.container, osType === 'ios' && styles.containerIos]}>
      <View style={[styles.header, osType === 'ios' && styles.headerIos]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={28} color={osType === 'ios' ? '#007aff' : '#0f172a'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, osType === 'ios' && styles.headerTitleIos]}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {settingsGroups.map((group, groupIndex) => (
          <View key={groupIndex} style={styles.group}>
            {osType !== 'ios' && <Text style={styles.groupTitle}>{group.title}</Text>}
            <View style={[styles.groupContent, osType === 'ios' && styles.groupContentIos]}>
              {group.items.map((item, itemIndex) => (
                <View key={item.id}>
                  <TouchableOpacity 
                    style={[styles.item, osType === 'ios' && styles.itemIos]}
                    onPress={() => {
                      if (item.id === 'security') {
                        handleSecurityPress();
                      }
                      if (item.id === 'display') {
                        handleDisplayPress();
                      }
                      if (item.id === 'storage' || item.id === 'upgrade-storage') {
                        setStorageModalVisible(true);
                      }
                    }}
                  >
                    <View style={[styles.itemIcon, osType === 'ios' ? { backgroundColor: item.color, borderRadius: 6 } : { backgroundColor: `${item.color}15` }]}>
                      <Ionicons name={item.icon} size={20} color={osType === 'ios' ? '#ffffff' : item.color} />
                    </View>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.value && (
                      <Text style={styles.itemValue}>{item.value}</Text>
                    )}
                    <Ionicons name="chevron-forward" size={20} color="#cbd5e1" style={styles.chevron} />
                  </TouchableOpacity>
                  {itemIndex < group.items.length - 1 && (
                    <View style={[styles.divider, osType === 'ios' && styles.dividerIos]} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Security/PIN Change Modal */}
      <Modal visible={securityModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {step === 1 ? 'Enter Current PIN' : step === 2 ? 'Enter New PIN' : 'Confirm New PIN'}
            </Text>
            <TextInput
              style={styles.pinInput}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              value={step === 1 ? currentPinInput : step === 2 ? newPinInput : confirmPinInput}
              onChangeText={step === 1 ? setCurrentPinInput : step === 2 ? setNewPinInput : setConfirmPinInput}
              placeholder="4-digit PIN"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setSecurityModalVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnPrimary]} 
                onPress={step === 1 ? handleVerifyCurrentPin : step === 2 ? handleNextStep : handleConfirmNewPin}
              >
                <Text style={styles.modalBtnTextLight}>{step === 1 ? 'Next' : step === 2 ? 'Next' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={displayModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Display</Text>
            <TouchableOpacity style={styles.displayActionBtn} onPress={handleResetBackground}>
              <Ionicons name="refresh-circle" size={20} color="#0a84ff" />
              <Text style={styles.displayActionText}>Reset Background</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setDisplayModalVisible(false)}>
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={storageModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upgrade Storage</Text>
            <Text style={styles.storageSummaryText}>
              {currentDevice?.name || 'Current device'}
            </Text>
            <Text style={styles.storageDetailText}>
              Used: {formatStorageValue(storageSnapshot.usedBytes)}
            </Text>
            <Text style={styles.storageDetailText}>
              Free: {formatStorageValue(storageSnapshot.availableBytes)}
            </Text>
            <Text style={styles.storageDetailText}>
              Current plan: {currentDevice?.storage || 0} MB
            </Text>

            <View style={styles.upgradeOptions}>
              {STORAGE_UPGRADE_OPTIONS.map((option) => {
                const isCurrentOrLower = option.storageMb <= Number(currentDevice?.storage || 0);
                return (
                  <TouchableOpacity
                    key={option.storageMb}
                    style={[
                      styles.upgradeOptionBtn,
                      isCurrentOrLower && styles.upgradeOptionBtnDisabled,
                    ]}
                    disabled={isCurrentOrLower}
                    onPress={() => handleUpgradeStorage(option)}
                  >
                    <Text
                      style={[
                        styles.upgradeOptionText,
                        isCurrentOrLower && styles.upgradeOptionTextDisabled,
                      ]}
                    >
                      {formatStoragePlan(option.storageMb)} - {formatNgn(option.priceNgn)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setStorageModalVisible(false)}>
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation Bar */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  containerIos: {
    backgroundColor: '#f2f2f7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerIos: {
    backgroundColor: '#f2f2f7',
    borderBottomWidth: 0,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerTitleIos: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  group: {
    marginBottom: 24,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 16,
    marginBottom: 8,
  },
  groupContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  groupContentIos: {
    borderRadius: 10,
    padding: 0,
    marginHorizontal: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  itemIos: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#0f172a',
  },
  itemValue: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 8,
  },
  chevron: {
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginLeft: 68,
  },
  dividerIos: {
    backgroundColor: '#e5e5ea',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  displayActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    marginBottom: 20,
  },
  displayActionText: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  storageSummaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  storageDetailText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 6,
  },
  upgradeOptions: {
    marginTop: 18,
    marginBottom: 12,
    gap: 10,
  },
  upgradeOptionBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
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
    fontSize: 15,
    fontWeight: '700',
  },
  upgradeOptionTextDisabled: {
    color: '#94a3b8',
  },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 12,
  },
  modalBtnPrimary: {
    backgroundColor: '#ef4444',
  },
  modalBtnText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  modalBtnTextLight: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
