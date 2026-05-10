import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { deviceService, messageService, signalService } from '../services/api';

export const CALL_NOTIFICATION_CATEGORY = 'cloudos_call';
export const MESSAGE_NOTIFICATION_CATEGORY = 'cloudos_message';

export const NOTIFICATION_ACTIONS = {
  answerCall: 'answer_call',
  declineCall: 'decline_call',
  replyMessage: 'reply_message',
  openMessage: 'open_message',
};

let notificationsModule = null;
let handlerConfigured = false;

export const isPushNotificationRuntimeAvailable = () => (
  Platform.OS !== 'web'
  && Constants?.appOwnership !== 'expo'
  && Constants?.executionEnvironment !== 'storeClient'
);

const getNotifications = () => {
  if (!isPushNotificationRuntimeAvailable()) {
    return null;
  }

  if (!notificationsModule) {
    notificationsModule = require('expo-notifications');
  }

  if (!handlerConfigured) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    handlerConfigured = true;
  }

  return notificationsModule;
};

export const configureNotificationActions = async () => {
  const Notifications = getNotifications();
  if (!Notifications) return;

  await Notifications.setNotificationCategoryAsync(CALL_NOTIFICATION_CATEGORY, [
    {
      identifier: NOTIFICATION_ACTIONS.answerCall,
      buttonTitle: 'Answer',
      options: { opensAppToForeground: true },
    },
    {
      identifier: NOTIFICATION_ACTIONS.declineCall,
      buttonTitle: 'Decline',
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(MESSAGE_NOTIFICATION_CATEGORY, [
    {
      identifier: NOTIFICATION_ACTIONS.replyMessage,
      buttonTitle: 'Reply',
      textInput: {
        submitButtonTitle: 'Send',
        placeholder: 'Type your reply...',
      },
      options: { opensAppToForeground: true },
    },
    {
      identifier: NOTIFICATION_ACTIONS.openMessage,
      buttonTitle: 'Open',
      options: { opensAppToForeground: true },
    },
  ]);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('incoming-calls', {
      name: 'Incoming calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 450, 700],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      bypassDnd: true,
    });

    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
    });
  }
};

export const getExpoPushToken = async () => {
  const Notifications = getNotifications();
  if (!Notifications) return null;

  if (Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient') {
    return null;
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (finalStatus !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return tokenResponse.data;
};

export const syncPushTokenForDevice = async ({ currentUser, currentDevice }) => {
  if (
    !isPushNotificationRuntimeAvailable()
    || Constants?.appOwnership === 'expo'
    || Constants?.executionEnvironment === 'storeClient'
  ) {
    return null;
  }

  if (!currentUser?.id || !currentDevice?.id || !currentDevice?.phoneNumber) {
    return null;
  }

  await configureNotificationActions();
  const pushToken = await getExpoPushToken();

  if (!pushToken) {
    return null;
  }

  await deviceService.syncPushToken({
    userId: currentUser.id,
    deviceId: currentDevice.id,
    phoneNumber: currentDevice.phoneNumber,
    pushToken,
    platform: Platform.OS,
  });

  return pushToken;
};

export const showIncomingCallNotification = async ({ callerPhoneNumber, callType }) => {
  await configureNotificationActions();
  const Notifications = getNotifications();
  if (!Notifications) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: callType === 'voice' ? 'Incoming voice call' : 'Incoming video call',
      body: `Call from ${callerPhoneNumber}`,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: CALL_NOTIFICATION_CATEGORY,
      data: {
        kind: 'call',
        callerPhoneNumber,
        callType,
      },
    },
    trigger: null,
  });
};

export const showMessageNotification = async ({ senderPhoneNumber, title, body }) => {
  await configureNotificationActions();
  const Notifications = getNotifications();
  if (!Notifications) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: title || senderPhoneNumber || 'New message',
      body: body || 'You have a new message.',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      categoryIdentifier: MESSAGE_NOTIFICATION_CATEGORY,
      data: {
        kind: 'message',
        senderPhoneNumber,
      },
    },
    trigger: null,
  });
};

export const handleNotificationResponse = async ({ response, currentUser, currentDevice, navigationRef }) => {
  const Notifications = getNotifications();
  if (!Notifications) return;

  const data = response?.notification?.request?.content?.data || {};
  const actionIdentifier = response?.actionIdentifier || Notifications.DEFAULT_ACTION_IDENTIFIER;

  if (data.kind === 'call') {
    const callerPhoneNumber = String(data.callerPhoneNumber || '').replace(/\D+/g, '');
    const callType = data.callType === 'voice' ? 'voice' : 'video';

    if (actionIdentifier === NOTIFICATION_ACTIONS.declineCall) {
      if (callerPhoneNumber && currentDevice?.phoneNumber) {
        await signalService.send({
          senderPhoneNumber: currentDevice.phoneNumber,
          receiverPhoneNumber: callerPhoneNumber,
          type: 'hangup',
          data: { reason: 'declined', at: new Date().toISOString() },
        });
      }
      return;
    }

    if (callerPhoneNumber && navigationRef.isReady()) {
      navigationRef.navigate('DeviceCallScreen', {
        mode: 'incoming',
        callerPhoneNumber,
        callType,
      });
    }
    return;
  }

  if (data.kind === 'message') {
    const peerPhoneNumber = String(data.senderPhoneNumber || '').replace(/\D+/g, '');

    if (actionIdentifier === NOTIFICATION_ACTIONS.replyMessage && response?.userText && peerPhoneNumber) {
      await messageService.send({
        userId: currentUser?.id,
        senderPhoneNumber: currentDevice?.phoneNumber,
        recipientPhoneNumber: peerPhoneNumber,
        body: response.userText,
      });
      return;
    }

    if (peerPhoneNumber && navigationRef.isReady()) {
      navigationRef.navigate('MainOS', {
        screen: 'MessagesScreen',
        params: {
          openPeer: {
            phone_number: peerPhoneNumber,
            name: peerPhoneNumber,
          },
        },
      });
    }
  }
};

export const addNotificationResponseListener = (listener) => {
  const Notifications = getNotifications();
  if (!Notifications) return { remove: () => {} };
  return Notifications.addNotificationResponseReceivedListener(listener);
};

export const getLastNotificationResponse = async () => {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  return Notifications.getLastNotificationResponseAsync();
};
