import { NativeModules, Platform } from 'react-native';

const { DirectCallModule } = NativeModules;

export const placeDirectCall = async (phoneNumber) => {
  if (Platform.OS !== 'android') {
    throw new Error('Direct SIM calling is only available on Android.');
  }

  if (!DirectCallModule?.placeCall) {
    throw new Error('Direct calling is not available in this build yet. Rebuild and reinstall the Android app.');
  }

  await DirectCallModule.placeCall(phoneNumber);
};
