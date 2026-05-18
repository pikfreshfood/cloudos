import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLock } from '../context/LockContext';
import { useOS } from '../context/OSContext';
import { useWallpaper } from '../context/WallpaperContext';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_DEVICE_STORAGE_MB, getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { STORAGE_UPGRADE_OPTIONS, formatNgn, formatStoragePlan } from '../constants/storagePlans';
import { appStoreService, fileService, mediaService, paystackService } from '../services/api';
import { getInstalledAppsStorageBytes, loadInstalledApps, toInstalledApp } from '../services/installedApps';
import {
  DEFAULT_RINGTONE_OPTIONS,
  getDefaultRingtoneOption,
  loadRingtoneSetting,
  playSound,
  resetRingtoneSetting,
  resolveSoundSource,
  saveRingtoneSetting,
  stopSound,
} from '../utils/soundSettings';

const formatStorageValue = (bytes) => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.max(bytes / (1024 * 1024), 0).toFixed(2)} MB`;
};

export default function SettingsScreen({ navigation }) {
  const { verifyPin, updatePin } = useLock();
  const { osType, currentDevice, getStorageDir } = useOS();
  const { resetWallpaper } = useWallpaper();
  const { currentUser, updateAccount } = useAuth();
  
  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [displayModalVisible, setDisplayModalVisible] = useState(false);
  const [storageModalVisible, setStorageModalVisible] = useState(false);
  const [ringtoneModalVisible, setRingtoneModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [accountNameInput, setAccountNameInput] = useState('');
  const [accountPasswordInput, setAccountPasswordInput] = useState('');
  const [accountConfirmPasswordInput, setAccountConfirmPasswordInput] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [storageSnapshot, setStorageSnapshot] = useState({
    usedBytes: 0,
    maxBytes: 0,
    availableBytes: 0,
  });
  const [installedApps, setInstalledApps] = useState([]);
  const [ringtoneSetting, setRingtoneSetting] = useState(null);
  const [ringtoneTracks, setRingtoneTracks] = useState([]);
  const [isLoadingRingtones, setIsLoadingRingtones] = useState(false);
  const ringtonePreviewRef = React.useRef(null);
  const installedAppsStorageBytes = useMemo(() => getInstalledAppsStorageBytes(installedApps), [installedApps]);
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

  const loadRingtoneOptions = useCallback(async () => {
    const savedSetting = await loadRingtoneSetting({
      userId: currentUser?.id,
      deviceId: currentDevice?.id,
      osType,
    });
    setRingtoneSetting(savedSetting);

    if (!currentUser?.id || !currentDevice?.id) {
      setRingtoneTracks([]);
      return;
    }

    setIsLoadingRingtones(true);
    try {
      const response = await mediaService.listMusic({
        userId: currentUser.id,
        deviceId: currentDevice.id,
      });
      setRingtoneTracks(response.tracks || []);
    } catch (error) {
      setRingtoneTracks([]);
      console.log('Failed to load ringtone music:', error?.message || error);
    } finally {
      setIsLoadingRingtones(false);
    }
  }, [currentDevice?.id, currentUser?.id, osType]);

  const handleRingtonePress = () => {
    setRingtoneModalVisible(true);
    loadRingtoneOptions().catch(() => {});
  };

  const handleAccountsPress = () => {
    setAccountNameInput(currentUser?.name || '');
    setAccountPasswordInput('');
    setAccountConfirmPasswordInput('');
    setAccountModalVisible(true);
  };

  useEffect(() => {
    loadRingtoneOptions().catch(() => {
      setRingtoneSetting(getDefaultRingtoneOption(osType));
    });
  }, [loadRingtoneOptions, osType]);

  const handleSelectRingtone = async (setting) => {
    stopSound(ringtonePreviewRef.current);
    ringtonePreviewRef.current = null;

    const savedSetting = await saveRingtoneSetting({
      userId: currentUser?.id,
      deviceId: currentDevice?.id,
      setting,
    });
    setRingtoneSetting(savedSetting);

    try {
      ringtonePreviewRef.current = await playSound(resolveSoundSource(savedSetting));
    } catch (error) {
      console.log('Failed to preview ringtone:', error?.message || error);
    }

    Alert.alert('Ringtone saved', `${savedSetting.title} will play for incoming calls.`);
  };

  const handleResetRingtone = async () => {
    stopSound(ringtonePreviewRef.current);
    ringtonePreviewRef.current = null;

    const defaultSetting = await resetRingtoneSetting({
      userId: currentUser?.id,
      deviceId: currentDevice?.id,
      osType,
    });
    setRingtoneSetting(defaultSetting);

    try {
      ringtonePreviewRef.current = await playSound(resolveSoundSource(defaultSetting));
    } catch (error) {
      console.log('Failed to preview default ringtone:', error?.message || error);
    }

    Alert.alert('Ringtone reset', `${defaultSetting.title} is now your incoming call ringtone.`);
  };

  useEffect(() => () => {
    stopSound(ringtonePreviewRef.current);
  }, []);

  const refreshStorageSnapshot = useCallback(async () => {
    if (!currentDevice) {
      setStorageSnapshot({ usedBytes: 0, maxBytes: 0, availableBytes: 0 });
      setInstalledApps([]);
      return;
    }

    try {
      const hasApiContext = !!currentUser?.id && !!currentDevice?.id;
      const maxBytes = Number(currentDevice.storage || DEFAULT_DEVICE_STORAGE_MB) * 1024 * 1024;
      const deviceApps = await loadInstalledApps({
        userId: currentUser?.id,
        deviceId: currentDevice?.id,
      });
      let normalizedDeviceApps = deviceApps;

      try {
        const storeResponse = await appStoreService.list();
        const storeAppsById = new Map((storeResponse.apps || []).map((app) => [String(app.id), app]));
        normalizedDeviceApps = deviceApps.map((app) => (
          storeAppsById.has(String(app.storeAppId))
            ? toInstalledApp(storeAppsById.get(String(app.storeAppId)))
            : app
        ));
      } catch (storeError) {
        console.log('Failed to refresh installed app store metadata.');
      }

      const appStorageBytes = getInstalledAppsStorageBytes(normalizedDeviceApps);
      setInstalledApps(normalizedDeviceApps);
      
      if (hasApiContext) {
        try {
          const apiResponse = await fileService.list({
            userId: currentUser.id,
            deviceId: currentDevice.id,
            folderPath: ''
          });

          if (apiResponse.used_space !== undefined) {
            const usedBytes = Number(apiResponse.used_space || 0) + appStorageBytes;
            setStorageSnapshot({
              usedBytes,
              maxBytes,
              availableBytes: Math.max(maxBytes - usedBytes, 0)
            });
            return;
          }
        } catch (apiError) {
          console.log('Failed to fetch API storage, falling back to local snapshot.');
        }
      }

      const snapshot = await getDeviceStorageSnapshot({
        baseDir: getStorageDir(),
        device: currentDevice,
      });
      const usedBytes = Number(snapshot.usedBytes || 0) + appStorageBytes;
      setStorageSnapshot({
        ...snapshot,
        usedBytes,
        availableBytes: Math.max(Number(snapshot.maxBytes || maxBytes) - usedBytes, 0),
      });
    } catch (error) {
      console.error('Failed to load storage snapshot:', error);
    }
  }, [currentDevice, currentUser?.id, getStorageDir]);

  useFocusEffect(
    useCallback(() => {
      refreshStorageSnapshot();
    }, [refreshStorageSnapshot])
  );

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

  const handleSaveAccount = async () => {
    const fullName = accountNameInput.trim();
    const password = accountPasswordInput.trim();
    const confirmPassword = accountConfirmPasswordInput.trim();

    if (!currentUser?.id) {
      Alert.alert('Account unavailable', 'Sign in again before updating your account.');
      return;
    }

    if (!fullName) {
      Alert.alert('Full name required', 'Enter your full name.');
      return;
    }

    if ((password || confirmPassword) && password.length < 6) {
      Alert.alert('Password too short', 'Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Confirm the same password before saving.');
      return;
    }

    setIsSavingAccount(true);
    const result = await updateAccount({
      userId: currentUser.id,
      name: fullName,
      password: password || undefined,
    });
    setIsSavingAccount(false);

    if (!result.ok) {
      Alert.alert('Update failed', result.error || 'Unable to update account.');
      return;
    }

    setAccountPasswordInput('');
    setAccountConfirmPasswordInput('');
    setAccountModalVisible(false);
    Alert.alert('Account updated', 'Your account details have been saved.');
  };

  const storageLabel = useMemo(() => {
    if (!currentDevice) return 'Unavailable';
    const usedFormatted = formatStorageValue(storageSnapshot.usedBytes);
    const maxMb = Number(currentDevice.storage || 0);
    const maxFormatted = maxMb >= 1024 ? `${(maxMb / 1024).toFixed(0)} GB` : `${maxMb} MB`;
    return `${usedFormatted} of ${maxFormatted} used`;
  }, [currentDevice, storageSnapshot.usedBytes]);

  const upgradeStorageValue = useMemo(() => {
    if (!currentDevice) return '0 MB';
    const maxMb = Number(currentDevice.storage || 0);
    return maxMb >= 1024 ? `${(maxMb / 1024).toFixed(0)} GB` : `${maxMb} MB`;
  }, [currentDevice]);

  const settingsGroups = [
    {
      title: 'Device',
      items: [
        { id: 'display', name: 'Display', icon: 'sunny', color: '#f59e0b' },
        { id: 'ringtone', name: 'Ringtone', icon: 'musical-notes', color: '#10b981', value: ringtoneSetting?.title || getDefaultRingtoneOption(osType).title },
        { id: 'storage', name: 'Storage', icon: 'server', color: '#6366f1', value: storageLabel },
        { id: 'installed-apps', name: 'Installed Apps', icon: 'apps', color: '#0ea5e9', value: `${installedApps.length} apps` },
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
                      if (item.id === 'ringtone') {
                        handleRingtonePress();
                      }
                      if (item.id === 'storage' || item.id === 'upgrade-storage') {
                        setStorageModalVisible(true);
                      }
                      if (item.id === 'installed-apps') {
                        navigation.navigate('InstalledAppsScreen');
                      }
                      if (item.id === 'accounts') {
                        handleAccountsPress();
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
              placeholderTextColor="#64748b"
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

      <Modal visible={ringtoneModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.ringtoneModalContent]}>
            <Text style={styles.modalTitle}>Ringtone</Text>

            <TouchableOpacity style={styles.resetRingtoneBtn} onPress={handleResetRingtone}>
              <Ionicons name="refresh-circle" size={21} color="#0f766e" />
              <Text style={styles.resetRingtoneText}>Reset ringtone</Text>
            </TouchableOpacity>

            <ScrollView style={styles.ringtoneList} showsVerticalScrollIndicator={false}>
              <Text style={styles.ringtoneSectionTitle}>Default tones</Text>
              {DEFAULT_RINGTONE_OPTIONS.map((option) => {
                const isSelected = ringtoneSetting?.id === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.ringtoneRow, isSelected && styles.ringtoneRowSelected]}
                    onPress={() => handleSelectRingtone(option)}
                  >
                    <View style={styles.ringtoneIcon}>
                      <Ionicons name="musical-note" size={17} color="#0f766e" />
                    </View>
                    <View style={styles.ringtoneTextWrap}>
                      <Text style={styles.ringtoneTitle}>{option.title}</Text>
                      <Text style={styles.ringtoneSubtitle}>{option.description}</Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark-circle" size={21} color="#10b981" /> : null}
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.ringtoneSectionTitle}>Uploaded music</Text>
              {isLoadingRingtones ? (
                <Text style={styles.ringtoneEmptyText}>Loading uploaded music...</Text>
              ) : ringtoneTracks.length ? (
                ringtoneTracks.map((track) => {
                  const uploadedSetting = {
                    id: track.id || track.path || track.url,
                    title: track.title || 'Uploaded music',
                    type: 'uploaded',
                    url: track.url,
                    path: track.path,
                  };
                  const isSelected = ringtoneSetting?.id === uploadedSetting.id;

                  return (
                    <TouchableOpacity
                      key={uploadedSetting.id}
                      style={[styles.ringtoneRow, isSelected && styles.ringtoneRowSelected]}
                      onPress={() => handleSelectRingtone(uploadedSetting)}
                    >
                      <View style={styles.ringtoneIcon}>
                        <Ionicons name="cloud-done-outline" size={17} color="#2563eb" />
                      </View>
                      <View style={styles.ringtoneTextWrap}>
                        <Text style={styles.ringtoneTitle}>{uploadedSetting.title}</Text>
                        <Text style={styles.ringtoneSubtitle}>{track.size || 'Cloud upload'}</Text>
                      </View>
                      {isSelected ? <Ionicons name="checkmark-circle" size={21} color="#10b981" /> : null}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.ringtoneEmptyText}>No uploaded music found on this device.</Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => {
                  stopSound(ringtonePreviewRef.current);
                  ringtonePreviewRef.current = null;
                  setRingtoneModalVisible(false);
                }}
              >
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={accountModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Account</Text>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={[styles.accountInput, styles.accountInputReadonly]}
              value={currentUser?.email || ''}
              editable={false}
              placeholder="Email"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.inputLabel}>Full name</Text>
            <TextInput
              style={styles.accountInput}
              value={accountNameInput}
              onChangeText={setAccountNameInput}
              placeholder="Full name"
              placeholderTextColor="#64748b"
              autoCapitalize="words"
            />
            <Text style={styles.inputLabel}>New password</Text>
            <TextInput
              style={styles.accountInput}
              value={accountPasswordInput}
              onChangeText={setAccountPasswordInput}
              placeholder="Leave blank to keep current password"
              placeholderTextColor="#64748b"
              secureTextEntry
            />
            <Text style={styles.inputLabel}>Confirm password</Text>
            <TextInput
              style={styles.accountInput}
              value={accountConfirmPasswordInput}
              onChangeText={setAccountConfirmPasswordInput}
              placeholder="Confirm new password"
              placeholderTextColor="#64748b"
              secureTextEntry
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtn}
                disabled={isSavingAccount}
                onPress={() => setAccountModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                disabled={isSavingAccount}
                onPress={handleSaveAccount}
              >
                <Text style={styles.modalBtnTextLight}>{isSavingAccount ? 'Saving...' : 'Save'}</Text>
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
              Installed apps: {formatStorageValue(installedAppsStorageBytes)}
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
  ringtoneModalContent: {
    maxHeight: '82%',
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
    backgroundColor: '#ffffff',
    color: '#0f172a',
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
  resetRingtoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    marginBottom: 14,
  },
  resetRingtoneText: {
    marginLeft: 10,
    color: '#0f766e',
    fontSize: 15,
    fontWeight: '800',
  },
  ringtoneList: {
    maxHeight: 420,
  },
  ringtoneSectionTitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 10,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  ringtoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    padding: 12,
    marginBottom: 10,
  },
  ringtoneRowSelected: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },
  ringtoneIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  ringtoneTextWrap: {
    flex: 1,
  },
  ringtoneTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  ringtoneSubtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  ringtoneEmptyText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  inputLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  accountInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 15,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  accountInputReadonly: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
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
  installedAppsList: {
    maxHeight: 300,
    marginTop: 6,
    marginBottom: 12,
  },
  installedAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  installedAppIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  installedAppInfo: {
    flex: 1,
  },
  installedAppName: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  installedAppStorage: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  uninstallBtn: {
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  uninstallText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
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
