import React, { useCallback, useState } from 'react';
import { Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useOS } from '../context/OSContext';
import { appStoreService } from '../services/api';
import { getInstalledAppsStorageBytes, loadInstalledApps, removeInstalledApp, toInstalledApp } from '../services/installedApps';

const formatStorageValue = (bytes) => {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.max(value / (1024 * 1024), 0).toFixed(2)} MB`;
};

export default function InstalledAppsScreen({ navigation }) {
  const { currentUser } = useAuth();
  const { osType, currentDevice } = useOS();
  const [installedApps, setInstalledApps] = useState([]);
  const [uninstallState, setUninstallState] = useState(null);

  const loadApps = useCallback(async () => {
    const deviceApps = await loadInstalledApps({
      userId: currentUser?.id,
      deviceId: currentDevice?.id,
    });

    let normalizedApps = deviceApps;
    try {
      const storeResponse = await appStoreService.list();
      const storeAppsById = new Map((storeResponse.apps || []).map((app) => [String(app.id), app]));
      normalizedApps = deviceApps.map((app) => (
        storeAppsById.has(String(app.storeAppId))
          ? toInstalledApp(storeAppsById.get(String(app.storeAppId)))
          : app
      ));
    } catch (error) {
      console.log('Failed to refresh installed app metadata.');
    }

    setInstalledApps(normalizedApps);
  }, [currentDevice?.id, currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      loadApps();
    }, [loadApps])
  );

  const uninstallApp = (app) => {
    Alert.alert(
      'Uninstall app',
      `Remove ${app.name} from this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Uninstall',
          style: 'destructive',
          onPress: async () => {
            try {
              setUninstallState({ appName: app.name, progress: 0.12 });
              await new Promise((resolve) => setTimeout(resolve, 220));
              setUninstallState({ appName: app.name, progress: 0.48 });
              const nextApps = await removeInstalledApp({
                userId: currentUser?.id,
                deviceId: currentDevice?.id,
                storeAppId: app.storeAppId,
              });
              setUninstallState({ appName: app.name, progress: 0.86 });
              setInstalledApps(nextApps);
              await new Promise((resolve) => setTimeout(resolve, 260));
              setUninstallState({ appName: app.name, progress: 1 });
            } finally {
              setTimeout(() => setUninstallState(null), 260);
            }
          },
        },
      ]
    );
  };

  const openApp = (app) => {
    if (app.params) {
      navigation.navigate(app.screen || 'BrowserScreen', app.params);
      return;
    }

    navigation.navigate('BrowserScreen');
  };

  const storageBytes = getInstalledAppsStorageBytes(installedApps);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Installed Apps</Text>
          <Text style={styles.headerSubtitle}>
            {installedApps.length} apps using {formatStorageValue(storageBytes)}
          </Text>
        </View>
        <TouchableOpacity onPress={loadApps} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {installedApps.length ? installedApps.map((app) => (
          <View key={app.storeAppId} style={styles.appRow}>
            <View style={styles.appIconWrap}>
              {app.iconUrl ? (
                <Image source={{ uri: app.iconUrl }} style={styles.appIcon} resizeMode="cover" />
              ) : (
                <Ionicons name="cube-outline" size={26} color="#ffffff" />
              )}
            </View>
            <View style={styles.appInfo}>
              <Text style={styles.appName} numberOfLines={1}>{app.name}</Text>
              <Text style={styles.appStorage}>{formatStorageValue(app.storageBytes)} used</Text>
            </View>
            <TouchableOpacity style={styles.openBtn} onPress={() => openApp(app)}>
              <Text style={styles.openText}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.uninstallBtn} onPress={() => uninstallApp(app)}>
              <Text style={styles.uninstallText}>Uninstall</Text>
            </TouchableOpacity>
          </View>
        )) : (
          <View style={styles.emptyState}>
            <Ionicons name="apps-outline" size={64} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No installed apps</Text>
            <Text style={styles.emptyText}>Apps installed from the App Store will appear here.</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!uninstallState} transparent animationType="fade">
        <View style={styles.progressOverlay}>
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Uninstalling</Text>
            <Text style={styles.progressSubtitle}>{uninstallState?.appName || 'App'}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round((uninstallState?.progress || 0) * 100)}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{Math.round((uninstallState?.progress || 0) * 100)}%</Text>
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: { flex: 1 },
  headerTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  headerSubtitle: { marginTop: 3, color: '#64748b', fontSize: 13, fontWeight: '700' },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, gap: 12, flexGrow: 1 },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 10,
  },
  appIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  appIcon: { width: '100%', height: '100%' },
  appInfo: { flex: 1, minWidth: 0 },
  appName: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  appStorage: { marginTop: 4, color: '#64748b', fontSize: 12, fontWeight: '700' },
  openBtn: {
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  openText: { color: '#0369a1', fontSize: 12, fontWeight: '900' },
  uninstallBtn: {
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  uninstallText: { color: '#b91c1c', fontSize: 12, fontWeight: '900' },
  progressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  progressCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 22,
  },
  progressTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  progressSubtitle: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    marginTop: 18,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#2563eb',
  },
  progressPercent: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'right',
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 420, padding: 24 },
  emptyTitle: { marginTop: 16, color: '#0f172a', fontSize: 18, fontWeight: '900' },
  emptyText: { marginTop: 8, color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20 },
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
  navBtn: { padding: 12, alignItems: 'center', justifyContent: 'center' },
});
