import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { loadInstalledApps, saveInstalledApp } from '../services/installedApps';
import { deviceService, messageService } from '../services/api';
import { resolveLocalRecipientDevice } from '../utils/recipientDevice';

export default function ShareAppScreen({ navigation }) {
  const { currentDevice } = useOS();
  const { accounts, currentUser } = useAuth();
  const [installedApps, setInstalledApps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppIds, setSelectedAppIds] = useState([]);
  
  // Sharing state
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareProgress, setShareProgress] = useState(0);

  const loadApps = async () => {
    try {
      setIsLoading(true);
      const apps = await loadInstalledApps({
        userId: currentUser?.id,
        deviceId: currentDevice?.id,
      });
      setInstalledApps(apps);
    } catch (error) {
      console.error('Failed to load apps for sharing:', error);
      Alert.alert('Error', 'Failed to load installed apps.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, [currentDevice?.id, currentUser?.id]);

  const handleSharePress = (app) => {
    setSelectedAppIds([app.id]);
    setShareModalVisible(true);
  };

  const toggleAppSelection = (app) => {
    setSelectedAppIds((previousIds) => (
      previousIds.includes(app.id)
        ? previousIds.filter((id) => id !== app.id)
        : [...previousIds, app.id]
    ));
  };

  const handleShareSelected = () => {
    if (selectedAppIds.length === 0) {
      Alert.alert('No apps selected', 'Mark one or more apps to share.');
      return;
    }

    setShareModalVisible(true);
  };

  const clearShareState = () => {
    setShareModalVisible(false);
    setRecipientPhone('');
    setIsSharing(false);
  };

  const handleShareToUser = async () => {
    if (!recipientPhone.trim()) {
      Alert.alert('Error', 'Please enter the recipient device phone number.');
      return;
    }

    const appsToShare = installedApps.filter((app) => selectedAppIds.includes(app.id));
    if (appsToShare.length === 0) {
      Alert.alert('No apps selected', 'Mark one or more apps to share.');
      return;
    }

    try {
      setIsSharing(true);
      setShareProgress(0.1);

      const localRecipientDevice = resolveLocalRecipientDevice({
        accounts,
        currentUser,
        currentDevice,
        phoneNumber: recipientPhone,
      });

      if (localRecipientDevice?.isCurrentDevice) {
        Alert.alert('Same device', 'Choose another device number, not the current device.');
        setIsSharing(false);
        return;
      }

      // 1. Check if user exists, unless the number belongs to another local device.
      const checkResponse = localRecipientDevice
        ? {
            exists: true,
            id: localRecipientDevice.userId,
            name: localRecipientDevice.name,
            phone_number: localRecipientDevice.phoneNumber,
          }
        : await messageService.checkNumber({ phoneNumber: recipientPhone });
      setShareProgress(0.3);

      if (!checkResponse.exists) {
        Alert.alert('Not found', 'The recipient device phone number does not exist on our records.');
        setIsSharing(false);
        return;
      }

      const shareResponse = await deviceService.shareInstalledApps({
        senderUserId: currentUser.id,
        senderDeviceId: currentDevice.id,
        recipientPhoneNumber: recipientPhone,
        apps: appsToShare,
      });

      if (localRecipientDevice) {
        for (let index = 0; index < appsToShare.length; index += 1) {
          await saveInstalledApp({
            userId: localRecipientDevice.userId,
            deviceId: localRecipientDevice.deviceId,
            app: appsToShare[index],
          });
          setShareProgress(0.35 + ((index + 1) / appsToShare.length) * 0.6);
        }
      } else {
        setShareProgress(0.95);
      }

      setShareProgress(1);
      
      setTimeout(() => {
        clearShareState();
        setSelectedAppIds([]);
        Alert.alert(
          'Success',
          shareResponse.message || `${appsToShare.length} app${appsToShare.length === 1 ? '' : 's'} shared.`
        );
      }, 500);

    } catch (error) {
      console.error('App sharing error:', error);
      setIsSharing(false);
      const message = error?.response?.data?.message || 'Failed to share app. Please try again.';
      Alert.alert('Sharing failed', message);
    }
  };

  const renderAppItem = ({ item }) => {
    const isSelected = selectedAppIds.includes(item.id);

    return (
      <View style={[styles.appCard, isSelected && styles.appCardSelected]}>
        <TouchableOpacity style={styles.appSelectArea} onPress={() => toggleAppSelection(item)} activeOpacity={0.85}>
          <View style={[styles.selectionBox, isSelected && styles.selectionBoxActive]}>
            {isSelected ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
          </View>
          <View style={styles.appIconContainer}>
            <Image source={require('../../assets/cloud-os-logo.png')} style={styles.appIcon} />
          </View>
          <View style={styles.appInfo}>
            <Text style={styles.appName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.appVersion}>Version {item.version || '1.0.0'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={() => handleSharePress(item)}>
          <Ionicons name="share-social" size={20} color="#ffffff" />
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share App</Text>
        <TouchableOpacity onPress={handleShareSelected} style={[styles.headerShareBtn, selectedAppIds.length === 0 && styles.headerShareBtnDisabled]}>
          <Ionicons name="share-social" size={20} color={selectedAppIds.length === 0 ? '#94a3b8' : '#ffffff'} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          {selectedAppIds.length > 0
            ? `${selectedAppIds.length} app${selectedAppIds.length === 1 ? '' : 's'} marked`
            : 'Mark one or more installed apps to share with another device.'}
        </Text>
        
        {isLoading ? (
          <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={installedApps}
            keyExtractor={item => item.id}
            renderItem={renderAppItem}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={(
              <View style={styles.emptyContainer}>
                <Ionicons name="apps-outline" size={64} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No apps to share</Text>
                <Text style={styles.emptyText}>Apps you download from the App Store will appear here.</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Share {selectedAppIds.length} app{selectedAppIds.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.modalSubtitle}>Enter the recipient's phone number</Text>
            <TextInput
              style={styles.textInput}
              value={recipientPhone}
              onChangeText={setRecipientPhone}
              placeholder="e.g. 08012345678"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
              autoFocus
              editable={!isSharing}
            />
            
            {isSharing && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${shareProgress * 100}%` }]} />
                </View>
                <Text style={styles.progressText}>Sharing... {Math.round(shareProgress * 100)}%</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalBtn} 
                onPress={clearShareState}
                disabled={isSharing}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnPrimary, isSharing && styles.modalBtnDisabled]} 
                onPress={handleShareToUser}
                disabled={isSharing}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalBtnTextLight}>Share</Text>
                )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  backBtn: {
    padding: 4,
  },
  headerShareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerShareBtnDisabled: {
    backgroundColor: '#e2e8f0',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  listContainer: {
    paddingBottom: 24,
  },
  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  appCardSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
  },
  appSelectArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  selectionBoxActive: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f1',
  },
  appIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIcon: {
    width: '100%',
    height: '100%',
  },
  appIconPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appInfo: {
    flex: 1,
    marginLeft: 16,
  },
  appName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  appVersion: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
  },
  shareBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '84%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
  },
  progressText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 90,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: '#6366f1',
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
  modalBtnText: {
    color: '#64748b',
    fontWeight: 'bold',
  },
  modalBtnTextLight: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
