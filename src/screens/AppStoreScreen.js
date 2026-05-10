import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { appStoreService } from '../services/api';
import { getStoreAppStorageBytes, loadInstalledApps } from '../services/installedApps';

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(value / 1024, 0).toFixed(1)} KB`;
};

export default function AppStoreScreen({ navigation }) {
  const { osType, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const [apps, setApps] = useState([]);
  const [installedIds, setInstalledIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadInstalled = useCallback(async () => {
    const installedApps = await loadInstalledApps({
      userId: currentUser?.id,
      deviceId: currentDevice?.id,
    });
    setInstalledIds(installedApps.map((app) => String(app.storeAppId)));
  }, [currentDevice?.id, currentUser?.id]);

  const loadStore = useCallback(async ({ silent = false, search = searchQuery } = {}) => {
    if (!silent) setLoading(true);
    setErrorMessage('');

    try {
      const [storeResponse] = await Promise.all([
        appStoreService.list({ search }),
        loadInstalled(),
      ]);

      setApps(Array.isArray(storeResponse?.apps) ? storeResponse.apps : []);
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to load the app store.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadInstalled, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadStore();
    }, [loadStore])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStore({ silent: true, search: searchQuery });
    }, 350);

    return () => clearTimeout(timer);
  }, [loadStore, searchQuery]);

  const refresh = () => {
    setRefreshing(true);
    loadStore({ silent: true });
  };

  const visibleApps = useMemo(() => apps, [apps]);

  const renderStars = (value) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= Math.round(Number(value || 0)) ? 'star' : 'star-outline'}
          size={16}
          color="#f59e0b"
        />
      ))}
    </View>
  );

  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.stateText}>Loading approved apps...</Text>
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={64} color="#ef4444" />
          <Text style={styles.stateTitle}>App Store unavailable</Text>
          <Text style={styles.stateText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={refresh}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!visibleApps.length) {
      return (
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={64} color="#94a3b8" />
          <Text style={styles.stateTitle}>No apps found</Text>
          <Text style={styles.stateText}>Approved developer apps will appear here automatically.</Text>
        </View>
      );
    }

    return (
      <View style={styles.appList}>
        {visibleApps.map((app) => {
          const isInstalled = installedIds.includes(String(app.id));

          return (
            <TouchableOpacity
              key={app.id}
              style={styles.appCard}
              onPress={() => navigation.navigate('AppStoreDetailScreen', { app })}
              activeOpacity={0.82}
            >
              <View style={styles.appIconWrap}>
                {app.icon_url ? (
                  <Image source={{ uri: app.icon_url }} style={styles.appIcon} resizeMode="cover" />
                ) : (
                  <Ionicons name="cube-outline" size={30} color="#ffffff" />
                )}
              </View>

              <View style={styles.appInfo}>
                <Text style={styles.appName} numberOfLines={1}>{app.name}</Text>
                <Text style={styles.developerName} numberOfLines={1}>
                  {app.developer_name || 'Cloud OS Developer'}
                </Text>
                <View style={styles.ratingLine}>
                  {renderStars(app.average_rating)}
                  <Text style={styles.ratingText}>
                    {Number(app.average_rating || 0).toFixed(1)} ({app.ratings_count || 0})
                  </Text>
                </View>
                <Text style={styles.appMeta} numberOfLines={1}>
                  {formatBytes(getStoreAppStorageBytes(app))} storage
                </Text>
              </View>

              <View style={styles.listAction}>
                <Text style={[styles.viewPill, isInstalled && styles.installedPill]}>
                  {isInstalled ? 'Installed' : 'View'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topSearchWrap}>
        <Ionicons name="search" size={18} color="#64748b" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search apps"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>App Store</Text>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={refresh}>
          <Text style={styles.headerActionTitle}>Installed Apps</Text>
          <Ionicons name="refresh" size={20} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {renderList()}
      </ScrollView>

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
  topSearchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 15 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  headerSubtitle: { marginTop: 4, fontSize: 13, color: '#64748b', maxWidth: 270, lineHeight: 18 },
  headerAction: {
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerActionTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },
  content: { flexGrow: 1, padding: 16 },
  centerState: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  stateTitle: { marginTop: 16, fontSize: 18, color: '#0f172a', fontWeight: '900', textAlign: 'center' },
  stateText: { marginTop: 8, fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  appList: { gap: 12 },
  appCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  appIcon: { width: '100%', height: '100%' },
  appInfo: { flex: 1, minWidth: 0 },
  appName: { fontSize: 16, color: '#0f172a', fontWeight: '900' },
  developerName: { marginTop: 3, color: '#475569', fontSize: 13, fontWeight: '700' },
  ratingLine: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 },
  starsRow: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { color: '#64748b', fontSize: 12, fontWeight: '800' },
  appMeta: { marginTop: 4, color: '#94a3b8', fontSize: 12 },
  listAction: { alignItems: 'flex-end', gap: 6 },
  viewPill: {
    minWidth: 70,
    overflow: 'hidden',
    borderRadius: 17,
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
  },
  installedPill: { backgroundColor: '#dcfce7', color: '#166534' },
  primaryButton: {
    marginTop: 18,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '900' },
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

