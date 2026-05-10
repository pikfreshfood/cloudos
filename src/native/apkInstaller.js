import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

export const installApk = async (filePath) => {
  if (Platform.OS !== 'android') {
    throw new Error('APK installation is only available on Android.');
  }

  if (!filePath) {
    throw new Error('No APK file path provided.');
  }

  const contentUri = await FileSystem.getContentUriAsync(filePath);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
};
