import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_DEVICE_STORAGE_MB, getDeviceStorageSnapshot } from '../utils/deviceStorage';
import { STORAGE_UPGRADE_OPTIONS, formatStorageDaysLeft, formatStorageExpiry, formatStoragePlanPrice } from '../constants/storagePlans';
import { fileService, paystackService, messageService } from '../services/api';
const EMPTY_STORAGE = { usedBytes: 0, maxBytes: 0, availableBytes: 0 };
const SUPPORT_PHONE_NUMBER = '0000000000';
const SUPPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const formatStorageAmount = (bytes) => {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.max(mb, 0).toFixed(2)} MB`;
};

export default function DashboardScreen({ navigation, route }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [upgradeDevice, setUpgradeDevice] = useState(null);
  const [storageSnapshots, setStorageSnapshots] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [supportUnreadCounts, setSupportUnreadCounts] = useState({});
  const [supportVisible, setSupportVisible] = useState(false);
  const [supportDevice, setSupportDevice] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportText, setSupportText] = useState('');
  const [supportAttachment, setSupportAttachment] = useState(null);
  const [isSupportLoading, setIsSupportLoading] = useState(false);
  const [isSupportSending, setIsSupportSending] = useState(false);
  const [isSupportClearing, setIsSupportClearing] = useState(false);
  const { selectDevice } = useOS();
  const { currentUser, logout } = useAuth();

  const phones = useMemo(
    () => (currentUser?.devices || []).filter((device) => ['android', 'ios'].includes(String(device?.os || '').toLowerCase())),
    [currentUser]
  );

  const supportErrorMessage = (error) => (
    error?.response?.data?.message
    || Object.values(error?.response?.data?.errors || {})?.flat()?.[0]
    || error?.message
    || 'Could not send message to support.'
  );

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
            const maxBytes = Number(phone.storage || DEFAULT_DEVICE_STORAGE_MB) * 1024 * 1024;
            
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
        const supportEntries = await Promise.all(
          phones.map(async (phone) => {
            if (!phone.phoneNumber) return [phone.id, 0];
            try {
              const response = await messageService.unreadCount({
                userId: currentUser.id,
                phoneNumber: phone.phoneNumber,
                peerPhoneNumber: SUPPORT_PHONE_NUMBER,
              });
              return [phone.id, response.unread_count || 0];
            } catch (err) {
              return [phone.id, 0];
            }
          })
        );
        if (isMounted) {
          setUnreadCounts(Object.fromEntries(entries));
          setSupportUnreadCounts(Object.fromEntries(supportEntries));
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

  const loadSupportThread = async (device = supportDevice, showLoading = true) => {
    if (!currentUser?.id || !device?.phoneNumber) return;

    try {
      if (showLoading) setIsSupportLoading(true);
      const response = await messageService.thread({
        userId: currentUser.id,
        ownerPhoneNumber: device.phoneNumber,
        peerPhoneNumber: SUPPORT_PHONE_NUMBER,
      });
      setSupportMessages(response.messages || []);
    } catch (error) {
      if (showLoading) {
        Alert.alert('Support unavailable', error?.response?.data?.message || 'Could not load support chat.');
      }
    } finally {
      if (showLoading) setIsSupportLoading(false);
    }
  };

  const openSupportChat = async (phone) => {
    if (!phone?.phoneNumber) {
      Alert.alert('Phone number required', 'This device needs a phone number before support chat can start.');
      return;
    }

    setSupportDevice(phone);
    setSupportVisible(true);
    await loadSupportThread(phone);
    setSupportUnreadCounts((prev) => ({ ...prev, [phone.id]: 0 }));
  };

  useEffect(() => {
    const openSupportPhoneNumber = route?.params?.openSupportPhoneNumber;
    if (!openSupportPhoneNumber || !phones.length) return;

    const normalizedTarget = String(openSupportPhoneNumber).replace(/\D+/g, '');
    const targetDevice = phones.find((phone) => (
      String(phone.phoneNumber || '').replace(/\D+/g, '') === normalizedTarget
    ));

    if (targetDevice) {
      openSupportChat(targetDevice).catch(() => {});
      navigation.setParams({ openSupportPhoneNumber: undefined });
    }
  }, [navigation, phones, route?.params?.openSupportPhoneNumber]);

  useEffect(() => {
    if (!route?.params?.showAppUpdate) return;

    Alert.alert(
      route?.params?.appUpdateTitle || 'Cloud OS update',
      'A new admin update is available for Cloud OS.'
    );
    navigation.setParams({ showAppUpdate: undefined, appUpdateTitle: undefined });
  }, [navigation, route?.params?.appUpdateTitle, route?.params?.showAppUpdate]);

  useEffect(() => {
    if (!supportVisible || !supportDevice?.phoneNumber) return undefined;

    const interval = setInterval(() => {
      loadSupportThread(supportDevice, false).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [supportDevice, supportVisible]);

  const closeSupportChat = () => {
    setSupportVisible(false);
    setSupportDevice(null);
    setSupportMessages([]);
    setSupportText('');
    setSupportAttachment(null);
  };

  const clearSupportChat = () => {
    if (!currentUser?.id || !supportDevice?.phoneNumber || isSupportClearing) return;

    Alert.alert(
      'Clear support chat',
      'Delete this live chat conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSupportClearing(true);
              await messageService.deleteThread({
                userId: currentUser.id,
                ownerPhoneNumber: supportDevice.phoneNumber,
                peerPhoneNumber: SUPPORT_PHONE_NUMBER,
              });
              setSupportMessages([]);
              setSupportText('');
              setSupportAttachment(null);
            } catch (error) {
              Alert.alert('Clear failed', error?.response?.data?.message || 'Could not clear support chat.');
            } finally {
              setIsSupportClearing(false);
            }
          },
        },
      ]
    );
  };

  const sendSupportMessage = async () => {
    const body = supportText.trim();
    if ((!body && !supportAttachment) || !currentUser?.id || !supportDevice?.phoneNumber) return;

    try {
      setIsSupportSending(true);
      await messageService.send({
        userId: currentUser.id,
        senderPhoneNumber: supportDevice.phoneNumber,
        recipientPhoneNumber: SUPPORT_PHONE_NUMBER,
        body,
        attachment: supportAttachment,
      });
      setSupportText('');
      setSupportAttachment(null);
      await loadSupportThread(supportDevice);
    } catch (error) {
      Alert.alert('Send failed', supportErrorMessage(error));
    } finally {
      setIsSupportSending(false);
    }
  };

  const pickSupportImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      if (asset.size && asset.size > SUPPORT_IMAGE_MAX_BYTES) {
        Alert.alert('Image too large', 'Please choose an image that is 5MB or smaller.');
        return;
      }

      setSupportAttachment({
        uri: asset.uri,
        name: asset.name || 'support-image.jpg',
        mimeType: asset.mimeType || 'image/jpeg',
        size: asset.size || 0,
      });
    } catch (error) {
      Alert.alert('Image unavailable', 'Could not open the image picker.');
    }
  };

  const handleUpgradeDevice = async (plan) => {
    if (!currentUser?.id || !upgradeDevice?.id) {
      Alert.alert('Error', 'No device selected for upgrade.');
      return;
    }

    const currentStorage = Number(upgradeDevice.storage || 0);
    if (plan.storageMb < currentStorage) {
      Alert.alert('Choose current or larger', 'Select the current plan to renew for one year, or choose a larger storage size.');
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
        billingPeriod: payment.billing_period || plan.billingPeriod,
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
          const storageDaysLeft = formatStorageDaysLeft(phone.storageExpiresAt);

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
                <Text style={styles.storageBadgeSubText}>{storageDaysLeft}</Text>
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

            <TouchableOpacity
              style={styles.supportBtn}
              onPress={() => openSupportChat(phone)}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#1d4ed8" />
              <Text style={styles.supportBtnText}>Support</Text>
              <View style={[styles.supportUnreadBadge, !supportUnreadCounts[phone.id] && styles.supportUnreadBadgeEmpty]}>
                <Text style={[styles.supportUnreadBadgeText, !supportUnreadCounts[phone.id] && styles.supportUnreadBadgeTextEmpty]}>
                  {supportUnreadCounts[phone.id] || 0}
                </Text>
              </View>
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
            <Text style={styles.planPrice}>Period left: {formatStorageDaysLeft(upgradeDevice?.storageExpiresAt)}</Text>
            <Text style={styles.planPrice}>Renews yearly. Expires: {formatStorageExpiry(upgradeDevice?.storageExpiresAt)}</Text>

            <View style={styles.upgradeOptions}>
              {STORAGE_UPGRADE_OPTIONS.map((option) => {
                const disabled = option.storageMb < Number(upgradeDevice?.storage || 0);
                const isRenewal = option.storageMb === Number(upgradeDevice?.storage || 0);
                return (
                  <TouchableOpacity
                    key={option.storageMb}
                    style={[styles.upgradeOptionBtn, disabled && styles.upgradeOptionBtnDisabled]}
                    disabled={disabled}
                    onPress={() => handleUpgradeDevice(option)}
                  >
                    <Text style={[styles.upgradeOptionText, disabled && styles.upgradeOptionTextDisabled]}>
                      {isRenewal ? 'Renew ' : ''}{formatStoragePlanPrice(option)}
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

      <Modal visible={supportVisible} transparent={true} animationType="slide" onRequestClose={closeSupportChat}>
        <View style={styles.supportModalOverlay}>
          <View style={styles.supportModalContent}>
            <View style={styles.supportHeader}>
              <View>
                <Text style={styles.supportTitle}>Support</Text>
                <Text style={styles.supportSubtitle}>{supportDevice?.name || 'Selected device'}</Text>
              </View>
              <View style={styles.supportHeaderActions}>
                <TouchableOpacity
                  onPress={clearSupportChat}
                  style={[styles.supportHeaderBtn, !supportMessages.length && styles.supportHeaderBtnDisabled]}
                  disabled={!supportMessages.length || isSupportClearing}
                >
                  <Ionicons
                    name="trash-outline"
                    size={22}
                    color={supportMessages.length && !isSupportClearing ? '#dc2626' : '#cbd5e1'}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={closeSupportChat} style={styles.supportHeaderBtn}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.supportMessages} contentContainerStyle={styles.supportMessagesContent}>
              {isSupportLoading ? (
                <Text style={styles.supportEmptyText}>Loading chat...</Text>
              ) : supportMessages.length ? (
                supportMessages.map((message) => {
                  const outgoing = message.direction === 'outgoing';
                  return (
                    <View key={message.id} style={[styles.supportBubbleRow, outgoing && styles.supportBubbleRowOutgoing]}>
                      <View style={[styles.supportBubble, outgoing ? styles.supportBubbleOutgoing : styles.supportBubbleIncoming]}>
                        {message.body ? (
                          <Text style={[styles.supportBubbleText, outgoing && styles.supportBubbleTextOutgoing]}>
                            {message.body}
                          </Text>
                        ) : null}
                        {message.attachment_url ? (
                          <Image source={{ uri: message.attachment_url }} style={styles.supportBubbleImage} resizeMode="cover" />
                        ) : null}
                        <Text style={[styles.supportBubbleTime, outgoing && styles.supportBubbleTimeOutgoing]}>
                          {message.created_at ? new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.supportEmptyText}>Start a live chat with support.</Text>
              )}
            </ScrollView>

            {supportAttachment ? (
              <View style={styles.supportAttachmentPreview}>
                <View style={styles.supportAttachmentInfo}>
                  <Ionicons name="image-outline" size={18} color="#1d4ed8" />
                  <Text style={styles.supportAttachmentName} numberOfLines={1}>{supportAttachment.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setSupportAttachment(null)} style={styles.supportAttachmentRemove}>
                  <Ionicons name="close" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.supportComposer}>
              <TouchableOpacity
                style={styles.supportAttachBtn}
                onPress={pickSupportImage}
                disabled={isSupportSending}
              >
                <Ionicons name="image-outline" size={22} color="#1d4ed8" />
              </TouchableOpacity>
              <TextInput
                style={styles.supportInput}
                value={supportText}
                onChangeText={setSupportText}
                placeholder="Type your message..."
                placeholderTextColor="#94a3b8"
                multiline
                editable={!isSupportSending}
              />
              <TouchableOpacity
                style={[styles.supportSendBtn, ((!supportText.trim() && !supportAttachment) || isSupportSending) && styles.supportSendBtnDisabled]}
                onPress={sendSupportMessage}
                disabled={(!supportText.trim() && !supportAttachment) || isSupportSending}
              >
                <Ionicons name="send" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
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
  storageBadgeSubText: {
    color: '#1d4ed8',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
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
  supportBtn: {
    width: '100%',
    marginTop: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  supportBtnText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '800',
  },
  supportUnreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportUnreadBadgeEmpty: {
    backgroundColor: '#dbeafe',
  },
  supportUnreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  supportUnreadBadgeTextEmpty: {
    color: '#1d4ed8',
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
  supportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  supportModalContent: {
    height: '82%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  supportHeader: {
    minHeight: 72,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supportTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  supportSubtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  supportHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  supportHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportHeaderBtnDisabled: {
    opacity: 0.7,
  },
  supportMessages: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  supportMessagesContent: {
    padding: 16,
    gap: 10,
  },
  supportBubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  supportBubbleRowOutgoing: {
    justifyContent: 'flex-end',
  },
  supportBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  supportBubbleIncoming: {
    backgroundColor: '#ffffff',
    borderColor: '#dbeafe',
    borderBottomLeftRadius: 6,
  },
  supportBubbleOutgoing: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
    borderBottomRightRadius: 6,
  },
  supportBubbleText: {
    color: '#0f172a',
    fontSize: 14,
    lineHeight: 20,
  },
  supportBubbleTextOutgoing: {
    color: '#ffffff',
  },
  supportBubbleImage: {
    width: 190,
    height: 190,
    borderRadius: 14,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  supportBubbleTime: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 5,
  },
  supportBubbleTimeOutgoing: {
    color: '#bfdbfe',
  },
  supportEmptyText: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 40,
    fontSize: 14,
  },
  supportComposer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: '#ffffff',
  },
  supportAttachmentPreview: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supportAttachmentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportAttachmentName: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  supportAttachmentRemove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  supportAttachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  supportInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0f172a',
    fontSize: 14,
  },
  supportSendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  supportSendBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
});
