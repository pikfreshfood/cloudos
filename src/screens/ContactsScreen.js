import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, FlatList, Linking, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { contactService } from '../services/api';
import { clearRecentCalls, loadRecentCalls, upsertRecentCall } from '../utils/callHistory';

const { width } = Dimensions.get('window');
const normalizePhoneNumber = (value) => String(value || '').replace(/\D+/g, '');

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

const splitDelimitedLine = (line, delimiter = ',') => {
  const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedDelimiter}(?=(?:(?:[^\"]*\"){2})*[^\"]*$)`);
  return line.split(pattern).map((value) => value.replace(/^"|"$/g, '').trim());
};

const detectDelimitedFileFormat = (lines) => {
  const sampleLine = lines.find((line) => line.trim()) || '';
  const delimiterCandidates = [',', ';', '\t'];
  const bestDelimiter = delimiterCandidates
    .map((delimiter) => ({
      delimiter,
      count: splitDelimitedLine(sampleLine, delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0];

  return {
    delimiter: bestDelimiter?.count > 1 ? bestDelimiter.delimiter : ',',
  };
};

const normalizeCsvHeader = (value) => value.replace(/^\uFEFF/, '').trim().toLowerCase();

const isLikelyNameHeader = (header) => (
  header === 'name'
  || header === 'full name'
  || header === 'first name'
  || header === 'display name'
  || header === 'given name'
);

const isLikelyPhoneHeader = (header) => (
  header.includes('phone')
  || header.includes('mobile')
  || header.includes('number')
  || header.includes('tel')
);

const normalizeImportedPhone = (value) => String(value || '').replace(/\D+/g, '');
const hasPhoneValue = (value) => normalizeImportedPhone(value).length > 0;
const normalizeContactName = (value) => String(value || '').trim().toLowerCase();
const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const formatRecentCallTime = (value) => {
  try {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const parseVCardContacts = (content) => {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const contacts = [];
  let currentContact = null;

  const flushContact = () => {
    if (!currentContact) return;

    const name = (currentContact.name || '').trim();
    const phones = [...new Set((currentContact.phones || []).filter(Boolean))];

    if (name && phones.length) {
      phones.forEach((phone) => {
        contacts.push({ name, phone });
      });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === 'BEGIN:VCARD') {
      currentContact = { name: '', phones: [] };
      continue;
    }

    if (line === 'END:VCARD') {
      flushContact();
      currentContact = null;
      continue;
    }

    if (!currentContact) {
      continue;
    }

    if (line.startsWith('FN:')) {
      currentContact.name = line.slice(3).trim();
      continue;
    }

    if (line.startsWith('TEL')) {
      const [, rawPhone = ''] = line.split(':', 2);
      const phone = normalizeImportedPhone(rawPhone);
      if (phone) {
        currentContact.phones.push(phone);
      }
    }
  }

  return contacts;
};

const getContactsApiErrorMessage = (error) => {
  const responseData = error?.response?.data;
  const fieldErrors = responseData?.errors || {};

  if (Array.isArray(fieldErrors.user_id) && fieldErrors.user_id.length) {
    return 'Your saved app session does not match the current Laravel users table. Sign out and sign in again.';
  }

  if (responseData?.message) {
    return responseData.message;
  }

  if (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the Laravel contacts API. Check that Laravel is running on your LAN IP and your phone is on the same Wi-Fi.';
  }

  if (error?.code === 'ECONNABORTED') {
    return 'The Laravel contacts API took too long to respond.';
  }

  if (error?.response?.status === 500) {
    return 'Laravel returned a server error while loading contacts. Check the Laravel log for the latest stack trace.';
  }

  return 'The app could not load your Laravel contacts right now.';
};

export default function ContactsScreen({ navigation }) {
  const { osType, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState([]);
  const [activeTab, setActiveTab] = useState('dialer');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [dialedNumber, setDialedNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recentCalls, setRecentCalls] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [importState, setImportState] = useState({
    visible: false,
    sourceLabel: 'contacts',
    processed: 0,
    total: 0,
    progress: 0,
  });

  const resetImportState = useCallback(() => {
    setImportState({
      visible: false,
      sourceLabel: 'contacts',
      processed: 0,
      total: 0,
      progress: 0,
    });
  }, []);

  const loadContacts = useCallback(async (showLoading = true) => {
    if (!currentUser?.id) {
      setContacts([]);
      return;
    }

    try {
      if (showLoading) setIsLoading(true);
      const response = await contactService.list({ userId: currentUser.id });
      setContacts(response.contacts || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      if (showLoading) {
        Alert.alert('Contacts unavailable', getContactsApiErrorMessage(error));
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      loadContacts().catch(() => {});
    }, [loadContacts])
  );

  const loadStoredRecentCalls = useCallback(async () => {
    if (!currentUser?.id) {
      setRecentCalls([]);
      return;
    }

    try {
      setRecentCalls(await loadRecentCalls(currentUser.id));
    } catch (error) {
      console.error('Failed to load recent calls:', error);
      setRecentCalls([]);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    loadStoredRecentCalls();
  }, [loadStoredRecentCalls]);

  useFocusEffect(
    useCallback(() => {
      loadStoredRecentCalls().catch(() => {});
    }, [loadStoredRecentCalls])
  );

  const filteredContacts = useMemo(() => {
    const data = Array.isArray(contacts) ? contacts : [];
    return data.filter((contact) => (
      String(contact.name || '').toLowerCase().includes(search.toLowerCase())
      || String(contact.phone_number || '').includes(search)
    ));
  }, [contacts, search]);

  const filteredRegularContacts = useMemo(
    () => filteredContacts.filter((contact) => !contact.linked_device),
    [filteredContacts]
  );

  const filteredDeviceNumberContacts = useMemo(
    () => filteredContacts.filter((contact) => !!contact.linked_device),
    [filteredContacts]
  );

  const displayedContacts = activeTab === 'deviceNumbers'
    ? filteredDeviceNumberContacts
    : filteredRegularContacts;

  const selectedContacts = useMemo(() => {
    const data = Array.isArray(contacts) ? contacts : [];
    return data.filter((contact) => selectedContactIds.includes(contact.id));
  }, [contacts, selectedContactIds]);

  const allFilteredSelected = displayedContacts.length > 0
    && displayedContacts.every((contact) => selectedContactIds.includes(contact.id));

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedContactIds([]);
      }

      return !prev;
    });
  };

  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((prev) => (
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    ));
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = displayedContacts.map((contact) => contact.id);

    if (!filteredIds.length) {
      return;
    }

    setSelectedContactIds((prev) => {
      if (allFilteredSelected) {
        return prev.filter((id) => !filteredIds.includes(id));
      }

      return [...new Set([...prev, ...filteredIds])];
    });
  };

  const registerRecentCall = useCallback((phoneNumber, contact = null) => {
    const normalizedPhoneNumber = String(phoneNumber || '').replace(/\D+/g, '');

    if (!normalizedPhoneNumber) {
      return;
    }

    upsertRecentCall(currentUser?.id, {
      name: contact?.name?.trim() || '',
      phone_number: normalizedPhoneNumber,
      type: 'outgoing',
    }).then(setRecentCalls).catch((error) => {
      console.error('Failed to persist recent call:', error);
    });
  }, [currentUser?.id]);

  const handleClearRecentCalls = useCallback(() => {
    Alert.alert('Clear call history', 'Remove all recent calls from this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const nextCalls = await clearRecentCalls(currentUser?.id);
          setRecentCalls(nextCalls);
        },
      },
    ]);
  }, [currentUser?.id]);

  const resetAddModal = () => {
    setShowAddModal(false);
    setNewName('');
    setNewPhone('');
  };

  const handleAddContact = async () => {
    if (!currentUser?.id) return;

    if (!newName.trim() || !hasPhoneValue(newPhone)) {
      Alert.alert('Invalid contact', 'Enter a name and a phone number.');
      return;
    }

    try {
      await contactService.save({
        userId: currentUser.id,
        name: newName.trim(),
        phoneNumber: normalizeImportedPhone(newPhone),
      });
      resetAddModal();
      loadContacts().catch(() => {});
      setActiveTab('contacts');
    } catch (error) {
      Alert.alert(
        'Save failed',
        getContactsApiErrorMessage(error)
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
      Alert.alert('Delete failed', getContactsApiErrorMessage(error));
    }
  };

  const handleCopyContact = async (contact) => {
    const contactText = `${contact.name || 'Contact'}\n${contact.phone_number || ''}`.trim();

    if (!contactText) {
      return;
    }

    await Clipboard.setStringAsync(contactText);
    Alert.alert('Copied', 'Contact copied to clipboard.');
  };

  const handleBulkDelete = async () => {
    if (!currentUser?.id || selectedContactIds.length === 0) return;

    Alert.alert(
      'Delete contacts',
      `Delete ${selectedContactIds.length} marked contact${selectedContactIds.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await contactService.removeMany({
                userId: currentUser.id,
                contactIds: selectedContactIds.map((id) => Number(id)),
              });
              setContacts((prev) => prev.filter((contact) => !selectedContactIds.includes(contact.id)));
              setSelectedContactIds([]);
              setSelectionMode(false);
            } catch (error) {
              Alert.alert('Delete failed', getContactsApiErrorMessage(error));
            }
          },
        },
      ]
    );
  };

  const handleExportSelectedToCsv = async () => {
    const contactsToExport = selectedContacts;

    if (!contactsToExport.length) {
      Alert.alert('No contacts selected', 'Mark one or more contacts to export them to CSV.');
      return;
    }

    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Unavailable', 'CSV export is not available on this device.');
        return;
      }

      const exportDir = `${FileSystem.cacheDirectory}exports/`;
      await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportPath = `${exportDir}contacts-${timestamp}.csv`;
      const csvRows = [
        'Name,Phone Number',
        ...contactsToExport.map((contact) => `${escapeCsvValue(contact.name)},${escapeCsvValue(contact.phone_number)}`),
      ];

      await FileSystem.writeAsStringAsync(exportPath, csvRows.join('\n'));
      await Sharing.shareAsync(exportPath, {
        mimeType: 'text/csv',
        dialogTitle: 'Export contacts CSV',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      console.error('Failed to export contacts CSV:', error);
      Alert.alert('Export failed', 'Could not export the selected contacts to CSV.');
    }
  };

  const handleImportCSV = async () => {
    if (!currentUser?.id) return;

    try {
      setShowImportModal(false);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/x-vcard', 'text/vcard', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      let successCount = 0;
      let skippedCount = 0;
      let failureCount = 0;
      let firstSaveError = null;
      setIsLoading(true);
      const existingNames = new Set(
        contacts
          .map((contact) => normalizeContactName(contact.name))
          .filter(Boolean)
      );
      const isVcfFile = /\.(vcf)$/i.test(result.assets[0]?.name || '') || /BEGIN:VCARD/i.test(fileContent);
      let records = [];

      if (isVcfFile) {
        records = parseVCardContacts(fileContent);
      } else {
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) throw new Error('Empty or invalid CSV file');

        const { delimiter } = detectDelimitedFileFormat(lines);
        const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeCsvHeader);
        const nameIndex = headers.findIndex(isLikelyNameHeader);
        const phoneIndexes = headers
          .map((header, index) => (isLikelyPhoneHeader(header) ? index : -1))
          .filter((index) => index >= 0);
        
        const targetNameIdx = nameIndex >= 0 ? nameIndex : 0;

        records = lines.slice(1).map((line) => {
          const parts = splitDelimitedLine(line, delimiter);
          if (parts.length <= targetNameIdx) {
            return null;
          }

          const name = parts[targetNameIdx]?.trim();
          const candidatePhoneValues = (
            phoneIndexes.length
              ? phoneIndexes.map((index) => parts[index])
              : parts.slice(1)
          );
          const phone = candidatePhoneValues
            .map(normalizeImportedPhone)
            .find((value) => value.length > 0);

          return name && phone ? { name, phone } : null;
        }).filter(Boolean);
      }

      if (!records.length) {
        Alert.alert(
          'Import Complete',
          'No contacts were imported. The selected file did not contain a valid name and phone number.'
        );
        return;
      }

      setImportState({
        visible: true,
        sourceLabel: isVcfFile ? 'VCF' : 'CSV',
        processed: 0,
        total: records.length,
        progress: 0,
      });

      for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const normalizedName = normalizeContactName(record.name);

        if (!normalizedName || existingNames.has(normalizedName)) {
          skippedCount++;
          const processed = index + 1;
          setImportState((prev) => ({
            ...prev,
            processed,
            total: records.length,
            progress: records.length ? processed / records.length : 0,
          }));
          continue;
        }

        try {
          await contactService.save({
            userId: currentUser.id,
            name: record.name,
            phoneNumber: record.phone,
          });
          successCount++;
          existingNames.add(normalizedName);
        } catch (err) {
          failureCount++;
          firstSaveError = firstSaveError || err;
          console.log('Failed to save one contact', err);
        } finally {
          const processed = index + 1;
          setImportState((prev) => ({
            ...prev,
            processed,
            total: records.length,
            progress: records.length ? processed / records.length : 0,
          }));
        }
      }

      if (successCount > 0) {
        Alert.alert(
          'Import Complete',
          `Imported ${successCount} contact${successCount === 1 ? '' : 's'} from ${isVcfFile ? 'VCF' : 'CSV'}.${skippedCount ? ` Skipped ${skippedCount} duplicate or invalid row${skippedCount === 1 ? '' : 's'}.` : ''}${failureCount ? ` ${failureCount} row${failureCount === 1 ? '' : 's'} could not be saved.` : ''}`
        );
      } else if (firstSaveError) {
        Alert.alert('Import Failed', getContactsApiErrorMessage(firstSaveError));
      } else {
        Alert.alert(
          'Import Complete',
          `No contacts were imported. ${skippedCount ? 'All rows were duplicates by name or did not contain a valid name and phone number.' : 'Check the file format and try again.'}`
        );
      }
      loadContacts().catch(() => {});
    } catch (error) {
      console.error('CSV Import Error:', error);
      Alert.alert('Import Failed', 'Could not parse or import the CSV file.');
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        resetImportState();
      }, 400);
    }
  };

  const openDeviceCall = useCallback(({ phoneNumber, contact = null, linkedDevice, callType }) => {
    registerRecentCall(phoneNumber, contact);
    setDialedNumber('');
    navigation.navigate('DeviceCallScreen', {
      mode: 'outgoing',
      receiverPhoneNumber: phoneNumber,
      receiverDevice: linkedDevice,
      callType,
    });
  }, [navigation, registerRecentCall]);

  const askDeviceCallType = useCallback(({ phoneNumber, contact = null, linkedDevice }) => {
    const displayName = contact?.name || phoneNumber;

    Alert.alert(
      'Choose call type',
      `Start a device call with ${displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Voice call',
          onPress: () => openDeviceCall({
            phoneNumber,
            contact,
            linkedDevice,
            callType: 'voice',
          }),
        },
        {
          text: 'Video call',
          onPress: () => openDeviceCall({
            phoneNumber,
            contact,
            linkedDevice,
            callType: 'video',
          }),
        },
      ],
    );
  }, [openDeviceCall]);

  const handleStartCall = useCallback(async (phoneNumber, contact = null) => {
    const normalizedPhoneNumber = String(phoneNumber || '').replace(/\D+/g, '');

    if (!normalizedPhoneNumber) {
      Alert.alert('Invalid number', 'Use a valid phone number.');
      return;
    }

    try {
      let linkedDevice = contact?.linked_device || null;

      if (!linkedDevice) {
        try {
          const lookup = await contactService.lookup({ phoneNumber: normalizedPhoneNumber });
          linkedDevice = lookup?.device || null;
        } catch (lookupError) {
          linkedDevice = null;
        }
      }

      if (linkedDevice) {
        const currentDeviceNumber = String(currentDevice?.phoneNumber || '').replace(/\D+/g, '');

        if (currentDeviceNumber && currentDeviceNumber === normalizedPhoneNumber) {
          Alert.alert('Same device', 'Choose another device number, not the current device.');
          return;
        }

        if (!currentDeviceNumber) {
          Alert.alert('Device call unavailable', 'This device does not have a registered device number.');
          return;
        }

        askDeviceCallType({
          phoneNumber: normalizedPhoneNumber,
          contact,
          linkedDevice,
        });
        return;
      }

      // Force native call via tel: protocol
      const telUrl = `tel:${normalizedPhoneNumber}`;
      const supported = await Linking.canOpenURL(telUrl);
      
      if (supported) {
        await Linking.openURL(telUrl);
        registerRecentCall(normalizedPhoneNumber, contact);
        setDialedNumber('');
      } else {
        Alert.alert('Call unavailable', 'Your device does not support native phone calls.');
      }
    } catch (error) {
      Alert.alert(
        'Call failed',
        error?.message || 'Could not start the call.'
      );
    }
  }, [askDeviceCallType, currentDevice?.phoneNumber, registerRecentCall]);

  const handleDialCallPress = async () => {
    if (!dialedNumber) {
      Alert.alert('Invalid number', 'Use a valid phone number.');
      return;
    }

    await handleStartCall(dialedNumber);
  };

  const handleDialSavePress = () => {
    if (!dialedNumber) return;
    setNewPhone(dialedNumber);
    setNewName('');
    setShowAddModal(true);
  };

  const handleContactCallPress = async (contact) => {
    await handleStartCall(contact.phone_number, contact);
  };

  const handleContactMessagePress = async (contact) => {
    const normalizedPhoneNumber = normalizePhoneNumber(contact?.phone_number);

    if (!normalizedPhoneNumber) {
      Alert.alert('Invalid number', 'Use a valid phone number.');
      return;
    }

    navigation.navigate('MessagesScreen', {
      openPeer: {
        name: contact.name || contact.linked_user?.name || normalizedPhoneNumber,
        phone_number: normalizePhoneNumber(
          contact.linked_device?.phone_number
          || contact.linked_user?.phone_number
          || normalizedPhoneNumber
        ),
      },
    });
  };

  const handleDialKeyPress = (key) => {
    if (!/[\d*#+]/.test(key)) return;
    setDialedNumber((prev) => `${prev}${key}`);
  };

  const renderContact = ({ item }) => {
    const isSelected = selectedContactIds.includes(item.id);
    const isDeviceNumber = !!item.linked_device;
    const isDeviceContact = isDeviceNumber || !!item.linked_user?.id;
    const contactStatus = isDeviceNumber ? '' : (isDeviceContact ? 'In-app message available' : 'In-app messages available');

    return (
      <TouchableOpacity
        style={styles.contactCard}
        onLongPress={toggleSelectionMode}
        onPress={() => selectionMode ? toggleContactSelection(item.id) : null}
        activeOpacity={selectionMode ? 0.7 : 1}
      >
        {selectionMode && (
          <View style={styles.checkboxWrap}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected ? <Ionicons name="checkmark" size={15} color="#ffffff" /> : null}
            </View>
          </View>
        )}
        <View style={styles.contactBody}>
          <View style={styles.contactMainRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.contactPhone} numberOfLines={1}>{item.phone_number}</Text>
              {!!contactStatus && (
                <Text style={isDeviceContact ? styles.contactStatus : styles.contactStatusMuted}>{contactStatus}</Text>
              )}
            </View>
          </View>

          <View style={styles.contactActions}>
            {selectionMode ? (
            <TouchableOpacity onPress={() => toggleContactSelection(item.id)} style={styles.markToggleBtn}>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={isSelected ? '#2563eb' : '#cbd5e1'}
              />
            </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity onPress={() => handleContactMessagePress(item)} style={styles.messageContactBtn}>
                  <Ionicons name="chatbubble-ellipses" size={16} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleCopyContact(item)} style={styles.copyContactBtn}>
                  <Ionicons name="copy-outline" size={16} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleContactCallPress(item)} style={styles.callContactBtn}>
                  <Ionicons name="call" size={15} color="#ffffff" />
                  <Text style={styles.callContactBtnText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={17} color="#ffffff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRecentCall = ({ item }) => {
    if (!item) return null;
    const callType = item.type === 'received' ? 'Call received' : item.type === 'missed' ? 'Missed call' : 'Outgoing call';
    const callIcon = item.type === 'received' ? 'call' : item.type === 'missed' ? 'call-outline' : 'arrow-up-outline';
    const callColor = item.type === 'missed' ? '#ef4444' : item.type === 'received' ? '#16a34a' : '#2563eb';

    return (
      <View style={styles.recentCallCard}>
        <View style={[styles.recentCallIcon, { backgroundColor: `${callColor}18` }]}>
          <Ionicons name={callIcon} size={18} color={callColor} />
        </View>
        <View style={styles.recentCallInfo}>
          <Text style={styles.recentCallName} numberOfLines={1}>
            {item.name || item.phone_number || 'Unknown'}
          </Text>
          <Text style={styles.recentCallMeta} numberOfLines={1}>
            {callType} - {item.phone_number}
            {item.created_at ? `  -  ${formatRecentCallTime(item.created_at)}` : ''}
          </Text>
        </View>
        <TouchableOpacity 
          onPress={() => item.phone_number && handleStartCall(item.phone_number, item)} 
          style={styles.callAgainBtn}
          disabled={!item.phone_number}
        >
          <Ionicons name="call" size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>
    );
  };

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
          <TouchableOpacity style={styles.topBarIcon} onPress={handleDialSavePress}>
            <Ionicons name="ellipsis-vertical" size={19} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.numberDisplayWrap}>
        <Text style={styles.dialerNumber}>{dialedNumber || ' '}</Text>
        <View style={styles.numberActionRow}>
          <Text style={styles.dialerHint}>Calls use your phone SIM directly</Text>
          <TouchableOpacity
            style={[styles.backspaceBtn, !dialedNumber && styles.backspaceBtnHidden]}
            onPress={() => setDialedNumber((prev) => prev.slice(0, -1))}
            disabled={!dialedNumber}
          >
            <Ionicons name="backspace-outline" size={22} color="#d1d5db" />
          </TouchableOpacity>
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
          style={[styles.mainCallBtn, !dialedNumber && styles.mainCallBtnDisabled]}
          onPress={handleDialCallPress}
          disabled={!dialedNumber}
        >
          <Ionicons name="call" size={30} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.phoneTabs}>
        <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('dialer')}>
          <Ionicons name="keypad" size={20} color="#ffffff" />
          <Text style={[styles.phoneTabText, activeTab === 'dialer' && styles.phoneTabTextActive]}>Keypad</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('recents')}>
          <Ionicons name="time-outline" size={20} color="#9ca3af" />
          <Text style={[styles.phoneTabText, activeTab === 'recents' && styles.phoneTabTextActive]}>Recents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('contacts')}>
          <Ionicons name="person-outline" size={20} color="#9ca3af" />
          <Text style={[styles.phoneTabText, activeTab === 'contacts' && styles.phoneTabTextActive]}>Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('deviceNumbers')}>
          <Ionicons name="phone-portrait-outline" size={20} color="#9ca3af" />
          <Text style={[styles.phoneTabText, activeTab === 'deviceNumbers' && styles.phoneTabTextActive]}>Device Numbers</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderContacts = () => {
    const isDeviceNumbersTab = activeTab === 'deviceNumbers';
    const listTitle = isDeviceNumbersTab ? 'Device Numbers' : 'Contacts';
    const emptyIcon = isDeviceNumbersTab ? 'phone-portrait-outline' : 'people';
    const emptyTitle = isDeviceNumbersTab ? 'No device numbers yet' : 'No contacts yet';
    const emptyText = isDeviceNumbersTab
      ? 'Save a registered device phone number as a contact and it will appear here.'
      : 'Add normal phone numbers so you can launch messages quickly.';

    return (
    <View style={styles.contactsScreen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{listTitle}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.addBtn} onPress={toggleSelectionMode}>
            <Ionicons name={selectionMode ? 'close-outline' : 'checkbox-outline'} size={24} color="#0f172a" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowImportModal(true)}>
            <Ionicons name="download-outline" size={24} color="#0f172a" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <Ionicons name="person-add" size={24} color="#0f172a" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.contactsContent}>
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

        {selectionMode && (
          <View style={styles.selectionToolbar}>
            <TouchableOpacity style={styles.selectionActionBtn} onPress={handleSelectAllFiltered}>
              <Ionicons name={allFilteredSelected ? 'remove-circle-outline' : 'checkmark-done-outline'} size={18} color="#0f172a" />
              <Text style={styles.selectionActionText}>{allFilteredSelected ? 'Unmark All' : 'Mark All'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionBtn, selectedContactIds.length === 0 && styles.selectionActionBtnDisabled]}
              onPress={handleExportSelectedToCsv}
              disabled={selectedContactIds.length === 0}
            >
              <Ionicons name="share-outline" size={18} color="#0f172a" />
              <Text style={styles.selectionActionText}>Export CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionBtn, styles.selectionActionDanger, selectedContactIds.length === 0 && styles.selectionActionBtnDisabled]}
              onPress={handleBulkDelete}
              disabled={selectedContactIds.length === 0}
            >
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              <Text style={[styles.selectionActionText, styles.selectionActionDangerText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {selectionMode && (
          <Text style={styles.selectionSummary}>
            {selectedContactIds.length} marked contact{selectedContactIds.length === 1 ? '' : 's'}
          </Text>
        )}

        <FlatList
          data={displayedContacts}
          keyExtractor={(item, index) => item?.id ? String(item.id) : `contact-${index}`}
          renderItem={renderContact}
          contentContainerStyle={styles.listContainer}
          refreshing={isLoading}
          onRefresh={loadContacts}
          ListEmptyComponent={(
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name={emptyIcon} size={32} color="#94a3b8" />
              </View>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          )}
        />
        
        <View style={styles.contactsTabs}>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('dialer')}>
            <Ionicons name="keypad-outline" size={20} color="#9ca3af" />
            <Text style={styles.contactTabText}>Keypad</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('recents')}>
            <Ionicons name="time-outline" size={20} color="#9ca3af" />
            <Text style={styles.contactTabText}>Recents</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('contacts')}>
            <Ionicons name="person" size={20} color={isDeviceNumbersTab ? '#9ca3af' : '#111827'} />
            <Text style={isDeviceNumbersTab ? styles.contactTabText : styles.contactTabTextActive}>Contacts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('deviceNumbers')}>
            <Ionicons name="phone-portrait-outline" size={20} color={isDeviceNumbersTab ? '#111827' : '#9ca3af'} />
            <Text style={isDeviceNumbersTab ? styles.contactTabTextActive : styles.contactTabText}>Device Numbers</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
    );
  };

  const renderRecents = () => (
    <View style={styles.contactsScreen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recents</Text>
        <View style={styles.headerRight}>
          {recentCalls.length ? (
            <TouchableOpacity style={styles.addBtn} onPress={handleClearRecentCalls}>
              <Ionicons name="trash-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.contactsContent}>
        <FlatList
          data={recentCalls}
          keyExtractor={(item, index) => item?.id ? String(item.id) : `recent-${index}`}
          renderItem={renderRecentCall}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={(
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="time-outline" size={32} color="#94a3b8" />
              </View>
              <Text style={styles.emptyTitle}>No recent calls</Text>
              <Text style={styles.emptyText}>Missed, received, and outgoing calls will appear here.</Text>
            </View>
          )}
        />

        <View style={styles.contactsTabs}>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('dialer')}>
            <Ionicons name="keypad-outline" size={20} color="#9ca3af" />
            <Text style={styles.contactTabText}>Keypad</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('recents')}>
            <Ionicons name="time-outline" size={20} color="#111827" />
            <Text style={styles.contactTabTextActive}>Recents</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('contacts')}>
          <Ionicons name="person-outline" size={20} color="#9ca3af" />
          <Text style={styles.contactTabText}>Contacts</Text>
        </TouchableOpacity>
          <TouchableOpacity style={styles.phoneTabBtn} onPress={() => setActiveTab('deviceNumbers')}>
            <Ionicons name="phone-portrait-outline" size={20} color="#9ca3af" />
            <Text style={styles.contactTabText}>Device Numbers</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {activeTab === 'dialer' ? renderDialer() : (activeTab === 'recents' ? renderRecents() : renderContacts())}

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Contact</Text>

            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor="#64748b"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
              value={newPhone}
              onChangeText={setNewPhone}
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

      <Modal visible={showImportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Import Contacts</Text>
            <Text style={styles.modalSubtitle}>Choose a source to import your contacts from.</Text>

            <TouchableOpacity style={styles.importOptionBtn} onPress={handleImportCSV}>
              <View style={[styles.importOptionIconWrap, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="document-text" size={24} color="#16a34a" />
              </View>
              <View style={styles.importOptionTextWrap}>
                <Text style={styles.importOptionTitle}>Import from File</Text>
                <Text style={styles.importOptionDesc}>Upload a .csv or .vcf contacts file</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel, { flex: 1, alignItems: 'center' }]} onPress={() => setShowImportModal(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={importState.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.importProgressModal}>
            <View style={styles.importProgressHeader}>
              <Ionicons name="cloud-upload-outline" size={28} color="#2563eb" />
              <Text style={styles.importProgressTitle}>Importing Contacts</Text>
            </View>
            <Text style={styles.importProgressSubtitle}>
              Processing {importState.sourceLabel} contacts
            </Text>
            <View style={styles.importProgressTrack}>
              <View
                style={[
                  styles.importProgressFill,
                  { width: `${Math.max(importState.progress * 100, 6)}%` },
                ]}
              />
            </View>
            <View style={styles.importProgressMetaRow}>
              <Text style={styles.importProgressMetaText}>
                {Math.round(importState.progress * 100)}%
              </Text>
              <Text style={styles.importProgressMetaText}>
                {importState.processed} of {importState.total}
              </Text>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  selectionActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  selectionActionBtnDisabled: {
    opacity: 0.45,
  },
  selectionActionText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  selectionActionDanger: {
    backgroundColor: '#fee2e2',
  },
  selectionActionDangerText: {
    color: '#b91c1c',
  },
  selectionSummary: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  listContainer: {
    paddingBottom: 120,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactBody: {
    flex: 1,
    minWidth: 0,
  },
  contactMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentCallCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  recentCallIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCallInfo: {
    flex: 1,
    marginLeft: 14,
  },
  recentCallName: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  recentCallMeta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  callAgainBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxWrap: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
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
    minWidth: 0,
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
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
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
  callContactBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  messageContactBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyContactBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markToggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    lineHeight: 20,
  },
  importProgressModal: {
    width: '84%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
  },
  importProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  importProgressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  importProgressSubtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 18,
  },
  importProgressTrack: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  importProgressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 999,
  },
  importProgressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  importProgressMetaText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  importOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
  },
  importOptionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importOptionTextWrap: {
    flex: 1,
    marginLeft: 14,
  },
  importOptionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  importOptionDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
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
