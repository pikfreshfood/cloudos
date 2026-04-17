import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { contactService } from '../services/api';

const { width } = Dimensions.get('window');

const DIALER_KEYS = [
  { value: '1', letters: '' },
  { value: '2', letters: 'ABC' },
  { value: '3', letters: 'DEF' },
  { value: '4', letters: 'GHI' },
  { value: '5', letters: 'JKL' },
  { value: '6', letters: 'MNO' },
  { value: '7', letters: 'PQRS' },
  { value: '8', letters: 'TUV' },
  { value: '9', letters: 'WXYZ' },
  { value: '*', letters: '' },
  { value: '0', letters: '+' },
  { value: '#', letters: '' },
];

const DIALER_KEY_SIZE = Math.min(Math.max((width - 96) / 3, 64), 80);

export default function ContactsScreen({ navigation }) {
  const { osType } = useOS();
  const { currentUser } = useAuth();
  const { startCall, isWorking } = useCall();
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState([]);
  const [activeTab, setActiveTab] = useState('dialer');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [dialedNumber, setDialedNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!currentUser?.id) {
      setContacts([]);
      return;
    }

    try {
      setIsLoading(true);
      const response = await contactService.list({ userId: currentUser.id });
      setContacts(response.contacts || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      Alert.alert('Contacts unavailable', 'The app could not load your Laravel contacts right now.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      loadContacts().catch(() => {});
    }, [loadContacts])
  );

  useEffect(() => {
    let cancelled = false;

    const runLookup = async () => {
      if (dialedNumber.length !== 9) {
        setLookupResult(null);
        setIsLookupLoading(false);
        return;
      }

      if (dialedNumber === currentUser?.phoneNumber) {
        setLookupResult({
          status: 'self',
          message: 'This is your own cloud phone number.',
          user: null,
        });
        setIsLookupLoading(false);
        return;
      }

      try {
        setIsLookupLoading(true);
        const response = await contactService.lookup({ phoneNumber: dialedNumber });

        if (cancelled) {
          return;
        }

        if (response?.user) {
          setLookupResult({
            status: 'found',
            message: `${response.user.name} is available for a cloud call.`,
            user: response.user,
          });
          return;
        }

        setLookupResult({
          status: 'missing',
          message: 'No cloud user was found with that phone number.',
          user: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLookupResult({
          status: 'error',
          message: 'The app could not verify that phone number right now.',
          user: null,
        });
      } finally {
        if (!cancelled) {
          setIsLookupLoading(false);
        }
      }
    };

    runLookup().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentUser?.phoneNumber, dialedNumber]);

  const filteredContacts = useMemo(() => (
    contacts.filter((contact) => (
      contact.name.toLowerCase().includes(search.toLowerCase())
      || contact.phone_number.includes(search)
    ))
  ), [contacts, search]);

  const resetAddModal = () => {
    setShowAddModal(false);
    setNewName('');
    setNewPhone('');
  };

  const handleAddContact = async () => {
    if (!currentUser?.id) return;

    if (!newName.trim() || !/^\d{9}$/.test(newPhone.trim())) {
      Alert.alert('Invalid contact', 'Enter a name and a valid 9-digit phone number.');
      return;
    }

    try {
      await contactService.save({
        userId: currentUser.id,
        name: newName.trim(),
        phoneNumber: newPhone.trim(),
      });
      resetAddModal();
      loadContacts().catch(() => {});
      setActiveTab('contacts');
    } catch (error) {
      Alert.alert(
        'Save failed',
        error?.response?.data?.message || 'Could not save this contact.'
      );
    }
  };

  const handleDelete = async (contactId) => {
    if (!currentUser?.id) return;

    try {
      await contactService.remove({
        userId: currentUser.id,
        contactId,
      });
      setContacts((prev) => prev.filter((contact) => contact.id !== contactId));
    } catch (error) {
      Alert.alert('Delete failed', error?.response?.data?.message || 'Could not delete this contact.');
    }
  };

  const handleStartCall = async (phoneNumber) => {
    if (!/^\d{9}$/.test(phoneNumber || '')) {
      Alert.alert('Invalid number', 'Use a valid 9-digit phone number.');
      return;
    }

    if (phoneNumber === currentUser?.phoneNumber) {
      Alert.alert('Invalid number', 'You cannot call your own cloud phone number.');
      return;
    }

    try {
      await startCall(phoneNumber);
      setDialedNumber('');
      setLookupResult(null);
    } catch (error) {
      Alert.alert(
        'Call failed',
        error?.response?.data?.message || error.message || 'Could not start the call.'
      );
    }
  };

  const handleDialCallPress = async () => {
    if (isWorking) {
      return;
    }

    if (isLookupLoading) {
      Alert.alert('Checking number', 'Please wait while we verify that cloud phone number.');
      return;
    }

    if (!/^\d{9}$/.test(dialedNumber || '')) {
      Alert.alert('Invalid number', 'Use a valid 9-digit phone number.');
      return;
    }

    if (lookupResult?.status === 'missing') {
      Alert.alert('User not found', lookupResult.message);
      return;
    }

    if (lookupResult?.status === 'error') {
      Alert.alert('Connection issue', lookupResult.message);
      return;
    }

    await handleStartCall(dialedNumber);
  };

  const handleContactCallPress = async (contact) => {
    if (isWorking) {
      return;
    }

    if (!contact?.linked_user) {
      Alert.alert(
        'Contact unavailable',
        'This contact is not linked to a cloud user yet. Check the number or ask them to register first.'
      );
      return;
    }

    await handleStartCall(contact.phone_number);
  };

  const handleDialKeyPress = (key) => {
    if (dialedNumber.length >= 9) return;
    setDialedNumber((prev) => `${prev}${key}`);
  };

  const canStartDialedCall = /^\d{9}$/.test(dialedNumber)
    && dialedNumber !== currentUser?.phoneNumber
    && !isWorking;

  const renderContact = ({ item }) => (
    <View style={styles.contactCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.contactPhone}>{item.phone_number}</Text>
        {item.linked_user ? (
          <Text style={styles.contactStatus}>Cloud user available for online calls</Text>
        ) : (
          <Text style={styles.contactStatusMuted}>Not linked to a cloud user yet</Text>
        )}
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity
          onPress={() => handleContactCallPress(item)}
          style={[styles.callContactBtn, !item.linked_user && styles.callContactBtnDisabled]}
          disabled={isWorking}
        >
          <Ionicons name="call" size={15} color="#ffffff" />
          <Text style={styles.callContactBtnText}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={17} color="#cbd5e1" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDialer = () => (
    <View style={styles.dialerScreen}>
      <View style={styles.dialerTopBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBarLeft}>
          <Ionicons name="chevron-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.topBarIcon} onPress={() => setActiveTab('contacts')}>
            <Ionicons name="search" size={21} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarIcon} onPress={() => setShowAddModal(true)}>
            <Ionicons name="ellipsis-vertical" size={19} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.dialerIdentityCard}>
        <Text style={styles.identityLabel}>Your Cloud Phone Number</Text>
        <Text style={styles.identityNumber}>{currentUser?.phoneNumber || '---------'}</Text>
      </View>

      <View style={styles.numberDisplayWrap}>
        <Text style={styles.dialerNumber}>{dialedNumber || ' '}</Text>
        <View style={styles.numberActionRow}>
          <Text style={styles.dialerHint}>Dial a user&apos;s 9-digit cloud phone number</Text>
          <TouchableOpacity
            style={[styles.backspaceBtn, !dialedNumber && styles.backspaceBtnHidden]}
            onPress={() => setDialedNumber((prev) => prev.slice(0, -1))}
            disabled={!dialedNumber}
          >
            <Ionicons name="backspace-outline" size={22} color="#d1d5db" />
          </TouchableOpacity>
        </View>
        <View style={styles.lookupStatusWrap}>
          {isLookupLoading ? (
            <Text style={styles.lookupTextMuted}>Checking cloud number...</Text>
          ) : lookupResult?.message ? (
            <Text
              style={[
                styles.lookupText,
                lookupResult.status === 'found' && styles.lookupTextSuccess,
                lookupResult.status === 'missing' && styles.lookupTextError,
                lookupResult.status === 'self' && styles.lookupTextMuted,
                lookupResult.status === 'error' && styles.lookupTextError,
              ]}
            >
              {lookupResult.message}
            </Text>
          ) : (
            <Text style={styles.lookupTextMuted}>Calls are placed by each user&apos;s unique phone number.</Text>
          )}
        </View>
      </View>

      <View style={styles.keypadWrap}>
        {DIALER_KEYS.map((key) => (
          <TouchableOpacity
            key={key.value}
            style={styles.keypadBtn}
            onPress={() => handleDialKeyPress(key.value)}
          >
            <Text style={styles.keypadValue}>{key.value}</Text>
            <Text style={styles.keypadLetters}>{key.letters || ' '}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.callActionWrap}>
        <TouchableOpacity
          style={[styles.mainCallBtn, !canStartDialedCall && styles.mainCallBtnDisabled]}
          onPress={handleDialCallPress}
          disabled={!canStartDialedCall}
        >
          <Ionicons name="call" size={30} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.phoneTabs}>
        <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('dialer')}>
          <Ionicons name="keypad" size={20} color="#ffffff" />
          <Text style={[styles.phoneTabText, styles.phoneTabTextActive]}>Keypad</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.phoneTabBtn}>
          <Ionicons name="time-outline" size={20} color="#9ca3af" />
          <Text style={styles.phoneTabText}>Recents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('contacts')}>
          <Ionicons name="person-outline" size={20} color="#9ca3af" />
          <Text style={styles.phoneTabText}>Contacts</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderContacts = () => (
    <View style={styles.contactsScreen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contacts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="person-add" size={24} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <View style={styles.contactsContent}>
        <LinearGradient
          colors={['#0f172a', '#13213e', '#1d4ed8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.contactsHero}
        >
          <Text style={styles.contactsHeroLabel}>Your Cloud Phone Number</Text>
          <Text style={styles.contactsHeroNumber}>{currentUser?.phoneNumber || '---------'}</Text>
          <Text style={styles.contactsHeroText}>Add other users by their 9-digit number so you can place online calls quickly.</Text>
        </LinearGradient>

        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => item.id}
          renderItem={renderContact}
          contentContainerStyle={styles.listContainer}
          refreshing={isLoading}
          onRefresh={loadContacts}
          ListEmptyComponent={(
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="people" size={32} color="#94a3b8" />
              </View>
              <Text style={styles.emptyTitle}>No contacts yet</Text>
              <Text style={styles.emptyText}>Add a 9-digit cloud number to let users call each other online.</Text>
            </View>
          )}
        />

        <View style={styles.contactsTabs}>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('dialer')}>
            <Ionicons name="keypad-outline" size={20} color="#9ca3af" />
            <Text style={styles.contactTabText}>Keypad</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn}>
            <Ionicons name="time-outline" size={20} color="#9ca3af" />
            <Text style={styles.contactTabText}>Recents</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn}>
            <Ionicons name="person" size={20} color="#111827" />
            <Text style={styles.contactTabTextActive}>Contacts</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {activeTab === 'dialer' ? renderDialer() : renderContacts()}

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Contact</Text>

            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.input}
              placeholder="9-digit Phone Number"
              keyboardType="number-pad"
              maxLength={9}
              value={newPhone}
              onChangeText={(value) => setNewPhone(value.replace(/\D+/g, '').slice(0, 9))}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={resetAddModal}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleAddContact}>
                <Text style={styles.modalBtnSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    backgroundColor: '#000000',
  },
  dialerScreen: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 8,
  },
  dialerTopBar: {
    minHeight: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarLeft: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topBarIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialerIdentityCard: {
    marginTop: 10,
    alignItems: 'center',
  },
  identityLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  identityNumber: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 8,
  },
  numberDisplayWrap: {
    marginTop: 12,
    alignItems: 'center',
    minHeight: 68,
    justifyContent: 'flex-end',
  },
  dialerNumber: {
    fontSize: 24,
    fontWeight: '400',
    color: '#ffffff',
    letterSpacing: 1.5,
    minHeight: 32,
  },
  numberActionRow: {
    marginTop: 4,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialerHint: {
    flex: 1,
    color: '#9ca3af',
    fontSize: 11,
    textAlign: 'center',
  },
  lookupStatusWrap: {
    marginTop: 8,
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  lookupText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  lookupTextSuccess: {
    color: '#4ade80',
  },
  lookupTextMuted: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  lookupTextError: {
    color: '#fca5a5',
  },
  backspaceBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspaceBtnHidden: {
    opacity: 0,
  },
  keypadWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 18,
    rowGap: 4,
  },
  keypadBtn: {
    width: '33.33%',
    height: DIALER_KEY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 24,
  },
  keypadLetters: {
    color: '#9ca3af',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
    minHeight: 12,
  },
  callActionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },
  mainCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCallBtnDisabled: {
    backgroundColor: '#166534',
  },
  phoneTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  phoneTabBtn: {
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  phoneTabText: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
  },
  phoneTabTextActive: {
    color: '#ffffff',
  },
  contactsScreen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#f8fafc',
  },
  backBtn: {
    padding: 4,
  },
  addBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  contactsContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  contactsHero: {
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
  },
  contactsHeroLabel: {
    color: 'rgba(219,234,254,0.76)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  contactsHeroNumber: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 10,
  },
  contactsHeroText: {
    color: '#dbeafe',
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  listContainer: {
    paddingBottom: 120,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '800',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 14,
  },
  contactName: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  contactPhone: {
    color: '#2563eb',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 1,
  },
  contactStatus: {
    color: '#16a34a',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  contactStatusMuted: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callContactBtn: {
    height: 34,
    borderRadius: 17,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 4,
  },
  callContactBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  callContactBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  contactsTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  contactTabText: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
  },
  contactTabTextActive: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  modalBtnCancel: {
    backgroundColor: '#e2e8f0',
  },
  modalBtnSave: {
    backgroundColor: '#2563eb',
  },
  modalBtnCancelText: {
    color: '#475569',
    fontWeight: '700',
  },
  modalBtnSaveText: {
    color: '#ffffff',
    fontWeight: '700',
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
});
