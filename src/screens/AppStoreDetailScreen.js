import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { getStoreAppStorageBytes, loadInstalledApps, saveInstalledApp } from '../services/installedApps';

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(value / 1024, 0).toFixed(1)} KB`;
};

export default function AppStoreDetailScreen({ navigation, route }) {
  const { osType, currentDevice } = useOS();
  const { currentUser } = useAuth();
  const routeApp = route?.params?.app || null;
  const [app, setApp] = useState(routeApp);
  const [reviews, setReviews] = useState([]);
  const [installedIds, setInstalledIds] = useState([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);

  useEffect(() => {
    if (!routeApp?.id) return;

    setApp(routeApp);
    setReviews([]);
    setRating(5);
    setComment('');
    setInstalling(false);
    setInstallProgress(0);
  }, [routeApp?.id]);

  const loadDetail = useCallback(async () => {
    if (!app?.id) return;

    setLoadingReviews(true);
    try {
      const [reviewResponse, installedApps] = await Promise.all([
        appStoreService.reviews({ appId: app.id }),
        loadInstalledApps({ userId: currentUser?.id, deviceId: currentDevice?.id }),
      ]);

      setReviews(Array.isArray(reviewResponse?.reviews) ? reviewResponse.reviews : []);
      setInstalledIds(installedApps.map((candidate) => String(candidate.storeAppId)));

      if (reviewResponse?.summary) {
        setApp((current) => ({
          ...current,
          average_rating: reviewResponse.summary.average_rating,
          ratings_count: reviewResponse.summary.ratings_count,
        }));
      }
    } catch (error) {
      Alert.alert('App details unavailable', error?.message || 'Unable to load app details.');
    } finally {
      setLoadingReviews(false);
    }
  }, [app?.id, currentDevice?.id, currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      loadDetail();
    }, [loadDetail])
  );

  if (!app) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>App not found</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isInstalled = installedIds.includes(String(app.id));
  const screenshots = Array.isArray(app.screenshots) ? app.screenshots : [];

  const renderStars = (value, onPress) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} disabled={!onPress} onPress={() => onPress?.(star)} style={styles.starBtn}>
          <Ionicons
            name={star <= Math.round(Number(value || 0)) ? 'star' : 'star-outline'}
            size={18}
            color="#f59e0b"
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  const installApp = async () => {
    try {
      setInstalling(true);
      setInstallProgress(0);

      await new Promise((resolve) => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 12;
          setInstallProgress(Math.min(progress, 96));
          if (progress >= 96) {
            clearInterval(interval);
            resolve();
          }
        }, 120);
      });

      const nextApps = await saveInstalledApp({
        userId: currentUser?.id,
        deviceId: currentDevice?.id,
        app,
      });

      setInstallProgress(100);
      setInstalledIds(nextApps.map((candidate) => String(candidate.storeAppId)));
      Alert.alert('App installed', `${app.name} has been added to your menu and Settings.`);
    } catch (error) {
      Alert.alert('Install failed', error?.message || 'The app could not be installed.');
    } finally {
      setTimeout(() => {
        setInstalling(false);
        setInstallProgress(0);
      }, 500);
    }
  };

  const submitReview = async () => {
    try {
      const response = await appStoreService.submitReview({
        appId: app.id,
        userId: String(currentUser?.id || ''),
        deviceId: currentDevice?.id || null,
        rating,
        comment,
      });

      if (response?.summary) {
        setApp((current) => ({
          ...current,
          average_rating: response.summary.average_rating,
          ratings_count: response.summary.ratings_count,
        }));
      }

      setComment('');
      await loadDetail();
      Alert.alert('Review saved', 'Your rating and comment have been posted.');
    } catch (error) {
      Alert.alert('Review failed', error?.response?.data?.message || error?.message || 'Unable to save your review.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.detailHero}>
          <View style={styles.detailTop}>
            <View style={styles.detailIconWrap}>
              {app.icon_url ? (
                <Image source={{ uri: app.icon_url }} style={styles.appIcon} resizeMode="cover" />
              ) : (
                <Ionicons name="cube-outline" size={42} color="#ffffff" />
              )}
            </View>
            <View style={styles.detailInfo}>
              <Text style={styles.detailTitle}>{app.name}</Text>
              <Text style={styles.developerName}>{app.developer_name || 'Cloud OS Developer'}</Text>
              <View style={styles.ratingLine}>
                {renderStars(app.average_rating)}
                <Text style={styles.ratingText}>{Number(app.average_rating || 0).toFixed(1)} from {app.ratings_count || 0} ratings</Text>
              </View>
              <Text style={styles.storageText}>Uses {formatBytes(getStoreAppStorageBytes(app))} device storage</Text>
            </View>
          </View>

          {installing && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${installProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>Installing {installProgress}%</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.installButton, isInstalled && styles.installedButton]}
            disabled={isInstalled || installing}
            onPress={installApp}
          >
            {installing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={[styles.installButtonText, isInstalled && styles.installedButtonText]}>
                {isInstalled ? 'Installed' : 'Install'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>About this app</Text>
          <Text style={styles.aboutText}>
            {app.description || 'The developer has not added an app description yet.'}
          </Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Screenshots</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.screenshotsRow}>
            {screenshots.length ? screenshots.map((screenshot, index) => (
              <Image
                key={`${screenshot.url}-${index}`}
                source={{ uri: screenshot.url }}
                style={styles.screenshotImage}
                resizeMode="cover"
              />
            )) : (
              <View style={styles.screenshotFallback}>
                <Text style={styles.stateText}>No screenshots uploaded for this app yet.</Text>
              </View>
            )}
          </ScrollView>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Rating and comments</Text>
          {renderStars(rating, setRating)}
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Write a comment"
            placeholderTextColor="#94a3b8"
            multiline
          />
          <TouchableOpacity style={styles.primaryButton} onPress={submitReview}>
            <Text style={styles.primaryButtonText}>Post Review</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionBlock}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionTitle}>Comments</Text>
            {loadingReviews && <ActivityIndicator size="small" color="#0ea5e9" />}
          </View>
          {reviews.length ? reviews.map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewTop}>
                {renderStars(review.rating)}
                <Text style={styles.reviewAuthor}>
                  {review.user_name || review.username || review.user_email || 'Registered user'}
                </Text>
              </View>
              {!!review.comment && <Text style={styles.reviewText}>{review.comment}</Text>}
            </View>
          )) : (
            <Text style={styles.stateText}>No comments yet.</Text>
          )}
        </View>
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
  header: {
    height: 58,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, paddingBottom: 30 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  stateText: { color: '#64748b', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  detailHero: { backgroundColor: '#ffffff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  detailTop: { flexDirection: 'row', gap: 14 },
  detailIconWrap: {
    width: 86,
    height: 86,
    borderRadius: 20,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  appIcon: { width: '100%', height: '100%' },
  detailInfo: { flex: 1, minWidth: 0 },
  detailTitle: { fontSize: 22, color: '#0f172a', fontWeight: '900' },
  developerName: { marginTop: 4, color: '#475569', fontSize: 13, fontWeight: '700' },
  ratingLine: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6, flexWrap: 'wrap' },
  starsRow: { flexDirection: 'row', alignItems: 'center' },
  starBtn: { paddingRight: 2 },
  ratingText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  storageText: { marginTop: 8, color: '#64748b', fontSize: 13 },
  installButton: {
    marginTop: 16,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  installedButton: { backgroundColor: '#dcfce7' },
  installButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  installedButtonText: { color: '#166534' },
  progressWrap: { marginTop: 16 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#0ea5e9' },
  progressText: { marginTop: 6, color: '#64748b', fontSize: 12, fontWeight: '800' },
  sectionBlock: { marginTop: 14, backgroundColor: '#ffffff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 16, color: '#0f172a', fontWeight: '900', marginBottom: 12 },
  aboutText: { color: '#334155', fontSize: 14, lineHeight: 21 },
  screenshotsRow: { gap: 12, paddingRight: 12 },
  screenshotImage: { width: 230, height: 360, borderRadius: 8, backgroundColor: '#e2e8f0' },
  screenshotFallback: {
    width: 230,
    height: 260,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  commentInput: {
    minHeight: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  primaryButton: {
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '900' },
  reviewsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewCard: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  reviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewAuthor: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  reviewText: { marginTop: 8, color: '#334155', fontSize: 14, lineHeight: 20 },
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

