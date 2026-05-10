import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

export const DEFAULT_ANDROID_RINGTONE_ID = 'default-android-ringtone';
export const DEFAULT_MESSAGE_TONE_ID = 'default-message-tone';
export const DEFAULT_IPHONE_RINGTONE_ID = 'default-iphone-ringtone';

const SOUND_SETTINGS_PATH = Platform.OS !== 'web'
  ? `${FileSystem.documentDirectory}cloud-os-sound-settings.json`
  : '';

const defaultSoundSources = {
  [DEFAULT_ANDROID_RINGTONE_ID]: require('../../assets/sounds/android.mp3'),
  [DEFAULT_MESSAGE_TONE_ID]: require('../../assets/sounds/message.mp3'),
  [DEFAULT_IPHONE_RINGTONE_ID]: require('../../assets/sounds/iphone.mp3'),
};

export const DEFAULT_SOUND_OPTIONS = [
  {
    id: DEFAULT_ANDROID_RINGTONE_ID,
    title: 'Android Device',
    type: 'default',
    description: 'Default Android ringtone',
  },
  {
    id: DEFAULT_MESSAGE_TONE_ID,
    title: 'Message Notification',
    type: 'default',
    description: 'Default message notification tone',
  },
  {
    id: DEFAULT_IPHONE_RINGTONE_ID,
    title: 'iPhone',
    type: 'default',
    description: 'Default iPhone ringtone',
  },
];

export const DEFAULT_RINGTONE_OPTIONS = DEFAULT_SOUND_OPTIONS.filter(
  (option) => option.id !== DEFAULT_MESSAGE_TONE_ID
);

export const getDefaultRingtoneOption = (osType = 'android') => (
  DEFAULT_RINGTONE_OPTIONS.find((option) => option.id === (
    osType === 'ios' ? DEFAULT_IPHONE_RINGTONE_ID : DEFAULT_ANDROID_RINGTONE_ID
  )) || DEFAULT_RINGTONE_OPTIONS[0]
);

export const getDefaultMessageToneOption = () => (
  DEFAULT_SOUND_OPTIONS.find((option) => option.id === DEFAULT_MESSAGE_TONE_ID)
);

const getSettingsKey = ({ userId, deviceId }) => `${userId || 'guest'}:${deviceId || 'device'}`;

const readAllSoundSettings = async () => {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem('cloud_os_sound_settings');
      return raw ? JSON.parse(raw) : {};
    }

    const info = await FileSystem.getInfoAsync(SOUND_SETTINGS_PATH);
    if (!info.exists) {
      return {};
    }

    const raw = await FileSystem.readAsStringAsync(SOUND_SETTINGS_PATH);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeAllSoundSettings = async (settings) => {
  if (Platform.OS === 'web') {
    localStorage.setItem('cloud_os_sound_settings', JSON.stringify(settings));
    return;
  }

  await FileSystem.writeAsStringAsync(SOUND_SETTINGS_PATH, JSON.stringify(settings));
};

export const loadRingtoneSetting = async ({ userId, deviceId, osType }) => {
  const allSettings = await readAllSoundSettings();
  const key = getSettingsKey({ userId, deviceId });
  const savedRingtone = allSettings[key]?.ringtone;

  if (!savedRingtone || savedRingtone.id === DEFAULT_MESSAGE_TONE_ID) {
    return getDefaultRingtoneOption(osType);
  }

  return savedRingtone;
};

export const saveRingtoneSetting = async ({ userId, deviceId, setting }) => {
  const allSettings = await readAllSoundSettings();
  const key = getSettingsKey({ userId, deviceId });
  allSettings[key] = {
    ...(allSettings[key] || {}),
    ringtone: setting,
  };
  await writeAllSoundSettings(allSettings);
  return setting;
};

export const resetRingtoneSetting = async ({ userId, deviceId, osType }) => {
  const nextSetting = getDefaultRingtoneOption(osType);
  await saveRingtoneSetting({ userId, deviceId, setting: nextSetting });
  return nextSetting;
};

export const resolveSoundSource = (setting, fallbackSetting = getDefaultRingtoneOption()) => {
  const activeSetting = setting || fallbackSetting;
  if (activeSetting?.type === 'uploaded' && activeSetting.url) {
    return activeSetting.url;
  }

  return defaultSoundSources[activeSetting?.id] || defaultSoundSources[fallbackSetting.id];
};

export const playSound = async (source, { loop = false } = {}) => {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'duckOthers',
  });

  const player = createAudioPlayer(source);
  player.loop = loop;
  player.play();

  if (!loop) {
    setTimeout(() => {
      try {
        player.release();
      } catch {}
    }, 8000);
  }

  return player;
};

export const stopSound = (player) => {
  if (!player) return;

  try {
    player.pause();
    player.release();
  } catch {}
};
