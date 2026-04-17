import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Animated, PanResponder, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRecentApps } from '../context/RecentAppsContext';
import { useOS } from '../context/OSContext';

const { width, height } = Dimensions.get('window');

const RecentAppCard = ({ app, navigation, removeRecentApp }) => {
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only capture vertical swipes (up to close)
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy < -10;
      },
      onPanResponderMove: Animated.event([
        null,
        { dy: pan.y }
      ], { useNativeDriver: false }),
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -100) {
          // Swiped up far enough to close
          Animated.timing(pan, {
            toValue: { x: 0, y: -height },
            duration: 200,
            useNativeDriver: false
          }).start(() => {
            removeRecentApp(app.id);
          });
        } else {
          // Bounce back
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false
          }).start();
        }
      }
    })
  ).current;

  return (
    <Animated.View 
      style={[
        styles.appCardContainer,
        { transform: [{ translateY: pan.y }] }
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.appHeader}>
        <View style={styles.appTitleGroup}>
          <View style={[styles.smallIconWrapper, { backgroundColor: app.color }]}>
            {app.type === 'ionicon' ? (
              <Ionicons name={app.icon} size={16} color="#ffffff" />
            ) : (
              <MaterialCommunityIcons name={app.icon} size={16} color="#ffffff" />
            )}
          </View>
          <Text style={styles.appName}>{app.name}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => removeRecentApp(app.id)}>
          <Ionicons name="close" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity 
        style={styles.appSnapshot} 
        activeOpacity={0.9}
        onPress={() => navigation.navigate(app.screen)}
      >
        <View style={[styles.snapshotPlaceholder, { backgroundColor: app.color }]}>
          {app.type === 'ionicon' ? (
            <Ionicons name={app.icon} size={80} color="#ffffff" style={{ opacity: 0.5 }} />
          ) : (
            <MaterialCommunityIcons name={app.icon} size={80} color="#ffffff" style={{ opacity: 0.5 }} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RecentAppsScreen({ navigation }) {
  const { osType } = useOS();
  const { recentApps, removeRecentApp } = useRecentApps();

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={() => navigation.navigate('DesktopScreen')}>
        <View style={styles.contentWrapper}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Recent Apps</Text>
          </View>

          {recentApps.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="apps" size={64} color="#334155" />
              <Text style={styles.emptyText}>No recent apps</Text>
            </View>
          ) : (
            <ScrollView 
              contentContainerStyle={styles.scrollContent}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={width * 0.75 + 20}
              decelerationRate="fast"
            >
              {recentApps.map((app) => (
                <RecentAppCard 
                  key={app.id} 
                  app={app} 
                  navigation={navigation} 
                  removeRecentApp={removeRecentApp} 
                />
              ))}
            </ScrollView>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Bottom Navigation Bar */}
      {osType !== 'ios' && (
        <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('RecentAppsScreen')}>
                  <Ionicons name="menu" size={24} color="#3b82f6" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('DesktopScreen')}>
                  <Ionicons name="radio-button-off" size={24} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.goBack()}>
                  <Ionicons name="chevron-back" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentWrapper: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 16,
    marginTop: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  appCardContainer: {
    width: width * 0.75,
    height: height * 0.65,
    marginRight: 20,
    backgroundColor: '#1e293b',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e293b',
  },
  appTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  appName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  appSnapshot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  snapshotPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
