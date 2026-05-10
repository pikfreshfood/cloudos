import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useOS } from '../context/OSContext';
import { contactService, messageService } from '../services/api';
import { getDefaultMessageToneOption, playSound, resolveSoundSource } from '../utils/soundSettings';

const normalizePhoneNumber = (value) => String(value || '').replace(/\D+/g, '');

const getMessageApiErrorMessage = (error) => {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the Laravel messaging API right now.';
  }

  return 'The app could not complete the messaging request.';
};

export default function MessagesScreen({ navigation, route }) {
  const { currentUser } = useAuth();
  const { currentDevice } = useOS();
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [composer, setComposer] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeListTab, setActiveListTab] = useState('conversations');
  const [chatSelectionMode, setChatSelectionMode] = useState(false);
  const [selectedChatPhoneNumbers, setSelectedChatPhoneNumbers] = useState([]);

  const currentPhoneNumber = currentDevice?.phoneNumber || '';

  const playMessageSound = useCallback(async () => {
    try {
      await playSound(resolveSoundSource(getDefaultMessageToneOption()));
    } catch (error) {
      console.log('Failed to play message sound:', error);
    }
  }, []);

  const filteredContacts = useMemo(() => (
    contacts.filter((contact) => (
      String(contact.name || '').toLowerCase().includes(search.toLowerCase())
      || String(contact.phone_number || '').includes(search)
    ))
  ), [contacts, search]);

  const filteredConversations = useMemo(() => (
    conversations.map((conversation) => {
      const conversationPhoneNumber = normalizePhoneNumber(conversation.phone_number);
      const savedContact = contacts.find((contact) => (
        normalizePhoneNumber(contact.phone_number) === conversationPhoneNumber
        || normalizePhoneNumber(contact.linked_device?.phone_number) === conversationPhoneNumber
        || normalizePhoneNumber(contact.linked_user?.phone_number) === conversationPhoneNumber
      ));

      return {
        ...conversation,
        name: savedContact?.name || conversation.name,
      };
    }).filter((conversation) => (
      String(conversation.name || '').toLowerCase().includes(search.toLowerCase())
      || String(conversation.phone_number || '').includes(search)
      || String(conversation.last_message || '').toLowerCase().includes(search.toLowerCase())
    ))
  ), [contacts, conversations, search]);

  const loadContacts = useCallback(async () => {
    if (!currentUser?.id) {
      setContacts([]);
      return;
    }

    const response = await contactService.list({ userId: currentUser.id });
    setContacts(response.contacts || []);
  }, [currentUser?.id]);

  const lastUnreadTotalRef = useRef(0);

  const loadConversations = useCallback(async () => {
    if (!currentUser?.id || !currentPhoneNumber) {
      setConversations([]);
      lastUnreadTotalRef.current = 0;
      return;
    }

    const response = await messageService.conversations({
      userId: currentUser.id,
      ownerPhoneNumber: currentPhoneNumber,
    });

    const newConversations = response.conversations || [];
    
    // Check if total unread count increased to play sound
    const newUnreadTotal = newConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    
    if (newUnreadTotal > lastUnreadTotalRef.current) {
      playMessageSound();
    }

    lastUnreadTotalRef.current = newUnreadTotal;
    setConversations(newConversations);
  }, [currentPhoneNumber, currentUser?.id, playMessageSound]);

  const loadThread = useCallback(async (peer) => {
    if (!currentUser?.id || !currentPhoneNumber || !peer?.phone_number) {
      setThreadMessages([]);
      return;
    }

    const response = await messageService.thread({
      userId: currentUser.id,
      ownerPhoneNumber: currentPhoneNumber,
      peerPhoneNumber: peer.phone_number,
    });

    setThreadMessages(response.messages || []);
  }, [currentPhoneNumber, currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async (showLoading = true) => {
        if (!currentUser?.id) {
          return;
        }

        try {
          if (showLoading) setIsLoading(true);
          await Promise.all([loadContacts(), loadConversations()]);

          if (selectedPeer?.phone_number && isActive) {
            await loadThread(selectedPeer);
          }
        } catch (error) {
          console.log('Messages refresh error:', error);
        } finally {
          if (isActive && showLoading) {
            setIsLoading(false);
          }
        }
      };

      load();

      // Poll every 10 seconds for new messages while screen is focused
      const interval = setInterval(() => {
        load(false);
      }, 10000);

      return () => {
        isActive = false;
        clearInterval(interval);
      };
    }, [currentUser?.id, loadContacts, loadConversations, loadThread, selectedPeer])
  );

  const openThread = useCallback(async (peer) => {
    if (chatSelectionMode) {
      const phoneNumber = normalizePhoneNumber(peer.phone_number);
      setSelectedChatPhoneNumbers((prev) => (
        prev.includes(phoneNumber)
          ? prev.filter((value) => value !== phoneNumber)
          : [...prev, phoneNumber]
      ));
      return;
    }

    setSelectedPeer({
      name: peer.name || peer.sender_name || '',
      phone_number: normalizePhoneNumber(peer.phone_number),
    });
    setActiveListTab('conversations');

    try {
      setIsLoading(true);
      await loadThread({
        phone_number: normalizePhoneNumber(peer.phone_number),
      });
      await loadConversations();
    } catch (error) {
      Alert.alert('Messages unavailable', getMessageApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [chatSelectionMode, loadConversations, loadThread]);

  const handleDeleteChats = useCallback(() => {
    if (!currentUser?.id || !currentPhoneNumber || selectedChatPhoneNumbers.length === 0) {
      return;
    }

    Alert.alert(
      'Delete chats',
      `Delete ${selectedChatPhoneNumbers.length} marked chat${selectedChatPhoneNumbers.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              for (const peerPhoneNumber of selectedChatPhoneNumbers) {
                await messageService.deleteThread({
                  userId: currentUser.id,
                  ownerPhoneNumber: currentPhoneNumber,
                  peerPhoneNumber,
                });
              }
              setSelectedChatPhoneNumbers([]);
              setChatSelectionMode(false);
              if (selectedPeer?.phone_number && selectedChatPhoneNumbers.includes(selectedPeer.phone_number)) {
                setSelectedPeer(null);
                setThreadMessages([]);
              }
              await loadConversations();
            } catch (error) {
              Alert.alert('Delete failed', getMessageApiErrorMessage(error));
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }, [currentPhoneNumber, currentUser?.id, loadConversations, selectedChatPhoneNumbers, selectedPeer?.phone_number]);

  useEffect(() => {
    const openPeer = route?.params?.openPeer;

    if (!openPeer?.phone_number) {
      return;
    }

    openThread(openPeer).catch(() => {});
    navigation.setParams({ openPeer: undefined });
  }, [navigation, openThread, route?.params?.openPeer]);

  const handleSend = async () => {
    const recipientPhoneNumber = normalizePhoneNumber(selectedPeer?.phone_number);

    if (!currentUser?.id || !currentPhoneNumber) {
      Alert.alert('Unavailable', 'This device does not have a messaging number yet.');
      return;
    }

    if (!recipientPhoneNumber) {
      Alert.alert('No recipient', 'Choose a contact to start messaging.');
      return;
    }

    if (!composer.trim() || isSending) {
      return;
    }

    try {
      setIsSending(true);
      const response = await messageService.send({
        userId: currentUser.id,
        senderPhoneNumber: currentPhoneNumber,
        recipientPhoneNumber,
        body: composer.trim(),
      });

      setComposer('');
      setThreadMessages((prev) => [...prev, response.data]);
      await loadConversations();
    } catch (error) {
      Alert.alert('Send failed', getMessageApiErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  const renderConversation = ({ item }) => {
    const phoneNumber = normalizePhoneNumber(item.phone_number);
    const isSelected = selectedChatPhoneNumbers.includes(phoneNumber);

    return (
    <TouchableOpacity
      style={[styles.listCard, isSelected && styles.listCardSelected]}
      onPress={() => openThread(item)}
      onLongPress={() => {
        setChatSelectionMode(true);
        setSelectedChatPhoneNumbers((prev) => prev.includes(phoneNumber) ? prev : [...prev, phoneNumber]);
      }}
    >
      {chatSelectionMode ? (
        <View style={[styles.chatCheckbox, isSelected && styles.chatCheckboxSelected]}>
          {isSelected ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
        </View>
      ) : null}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(item.name || item.phone_number).charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.listInfo}>
        <Text style={styles.listName} numberOfLines={1}>{item.name || item.phone_number}</Text>
        <Text style={styles.listMeta} numberOfLines={1}>{item.last_message || 'No messages yet'}</Text>
      </View>
      <View style={styles.listRight}>
        <Text style={styles.listTime}>{item.last_message_at ? new Date(item.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
        {item.unread_count ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
    );
  };

  const renderContact = ({ item }) => (
    <TouchableOpacity style={styles.listCard} onPress={() => openThread(item)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.listInfo}>
        <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.listMeta}>{item.phone_number}</Text>
      </View>
      <Ionicons name="chatbubble-ellipses-outline" size={20} color="#64748b" />
    </TouchableOpacity>
  );

  const renderMessage = ({ item }) => {
    const isOutgoing = item.direction === 'outgoing';

    return (
      <View style={[styles.messageRow, isOutgoing ? styles.messageRowOutgoing : styles.messageRowIncoming]}>
        <View style={[styles.messageBubble, isOutgoing ? styles.messageBubbleOutgoing : styles.messageBubbleIncoming]}>
          {!isOutgoing && item.sender_name ? (
            <Text style={styles.messageSender}>{item.sender_name}</Text>
          ) : null}
          <Text style={[styles.messageBody, isOutgoing && styles.messageBodyOutgoing]}>{item.body}</Text>
          <Text style={[styles.messageTime, isOutgoing && styles.messageTimeOutgoing]}>
            {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </Text>
        </View>
      </View>
    );
  };

  if (selectedPeer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedPeer(null)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>{selectedPeer.name || selectedPeer.phone_number}</Text>
            <Text style={styles.headerSubtitle}>{selectedPeer.phone_number}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => loadThread(selectedPeer)} style={styles.headerActionBtn}>
              <Ionicons name="refresh-outline" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={threadMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.threadContainer}
          refreshing={isLoading}
          onRefresh={() => loadThread(selectedPeer)}
          ListEmptyComponent={(
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>Start the conversation with a message below.</Text>
            </View>
          )}
        />

        <View style={styles.composerBar}>
          <TextInput
            style={styles.composerInput}
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            value={composer}
            onChangeText={setComposer}
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, isSending && styles.sendBtnDisabled]} onPress={handleSend} disabled={isSending}>
            {isSending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="send" size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={28} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>This device number: {currentPhoneNumber || 'Unavailable'}</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.content}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages or contacts..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeListTab === 'conversations' && styles.segmentBtnActive]}
            onPress={() => setActiveListTab('conversations')}
          >
            <Text style={[styles.segmentText, activeListTab === 'conversations' && styles.segmentTextActive]}>Chats</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeListTab === 'contacts' && styles.segmentBtnActive]}
            onPress={() => setActiveListTab('contacts')}
          >
            <Text style={[styles.segmentText, activeListTab === 'contacts' && styles.segmentTextActive]}>Contacts</Text>
          </TouchableOpacity>
        </View>

        {activeListTab === 'conversations' && chatSelectionMode ? (
          <View style={styles.chatSelectionToolbar}>
            <TouchableOpacity
              style={styles.chatSelectionAction}
              onPress={() => {
                if (selectedChatPhoneNumbers.length === filteredConversations.length) {
                  setSelectedChatPhoneNumbers([]);
                  return;
                }
                setSelectedChatPhoneNumbers(filteredConversations.map((conversation) => normalizePhoneNumber(conversation.phone_number)));
              }}
            >
              <Ionicons name="checkmark-done-outline" size={18} color="#0f172a" />
              <Text style={styles.chatSelectionText}>
                {selectedChatPhoneNumbers.length === filteredConversations.length ? 'Unmark All' : 'Mark All'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chatSelectionAction, styles.chatSelectionDanger, selectedChatPhoneNumbers.length === 0 && styles.chatSelectionDisabled]}
              onPress={handleDeleteChats}
              disabled={selectedChatPhoneNumbers.length === 0}
            >
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              <Text style={[styles.chatSelectionText, styles.chatSelectionDangerText]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chatSelectionClose}
              onPress={() => {
                setChatSelectionMode(false);
                setSelectedChatPhoneNumbers([]);
              }}
            >
              <Ionicons name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </View>
        ) : null}

        <FlatList
          data={activeListTab === 'conversations' ? filteredConversations : filteredContacts}
          keyExtractor={(item) => `${item.phone_number}-${activeListTab}`}
          renderItem={activeListTab === 'conversations' ? renderConversation : renderContact}
          refreshing={isLoading}
          onRefresh={() => Promise.all([loadContacts(), loadConversations()])}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={(
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>
                {activeListTab === 'conversations' ? 'No conversations yet' : 'No contacts available'}
              </Text>
              <Text style={styles.emptyText}>
                {activeListTab === 'conversations'
                  ? 'Open a contact and send a message to create your first chat.'
                  : 'Add contacts first, then you can message them here.'}
              </Text>
            </View>
          )}
        />
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
  },
  backBtn: {
    padding: 4,
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  iconBtn: {
    width: 32,
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionBtn: {
    padding: 6,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    color: '#64748b',
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#0f172a',
  },
  listContainer: {
    paddingBottom: 24,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  listCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  chatCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  chatCheckboxSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chatSelectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  chatSelectionAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
  },
  chatSelectionDanger: {
    backgroundColor: '#fee2e2',
  },
  chatSelectionDisabled: {
    opacity: 0.5,
  },
  chatSelectionText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  chatSelectionDangerText: {
    color: '#b91c1c',
  },
  chatSelectionClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#1d4ed8',
    fontSize: 17,
    fontWeight: '800',
  },
  listInfo: {
    flex: 1,
    marginLeft: 14,
  },
  listName: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  listMeta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  listRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  listTime: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  threadContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  messageRowOutgoing: {
    justifyContent: 'flex-end',
  },
  messageRowIncoming: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageBubbleOutgoing: {
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 6,
  },
  messageBubbleIncoming: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageSender: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageBody: {
    color: '#0f172a',
    fontSize: 15,
    lineHeight: 22,
  },
  messageBodyOutgoing: {
    color: '#ffffff',
  },
  messageTime: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'right',
  },
  messageTimeOutgoing: {
    color: '#dbeafe',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 10,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 46,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.8,
  },
  attachmentPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  attachmentPreviewText: {
    flex: 1,
    marginRight: 8,
    color: '#334155',
    fontSize: 12,
  },
  attachmentWrap: {
    marginTop: 8,
  },
  attachmentImage: {
    width: 160,
    height: 160,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  attachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  attachmentText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '600',
  },
  attachmentTextOutgoing: {
    color: '#1e293b',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },
});
