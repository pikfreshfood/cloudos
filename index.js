import { registerRootComponent } from 'expo';

import { restoreContactSyncTaskAsync } from './src/utils/contactSync';
import { restoreOfflineSyncTaskAsync } from './src/utils/offlineFolderSync';
import App from './App';

restoreContactSyncTaskAsync().catch((error) => {
  console.log('Contact sync restore failed:', error?.message || error);
});
restoreOfflineSyncTaskAsync().catch((error) => {
  console.log('Folder sync restore failed:', error?.message || error);
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
