import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image, FlatList, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useWallpaper } from '../context/WallpaperContext';
import * as FileSystem from 'expo-file-system/legacy';
import { useOS } from '../context/OSContext';
import { useAuth } from '../context/AuthContext';
import { mediaService } from '../services/api';

const { width, height } = Dimensions.get('window');

export default function GalleryScreen({ navigation }) {
  const { currentUser } = useAuth();
  const { getStorageDir, osType, currentDeviceId } = useOS();
  const { updateWallpaper } = useWallpaper();
  const [images, setImages] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasApiContext = !!currentUser?.id && !!currentDeviceId;

  useFocusEffect(
    useCallback(() => {
      fetchImages();
    }, [currentUser?.id, currentDeviceId])
  );

  const fetchImages = async () => {
    try {
      setIsLoading(true);
      if (hasApiContext) {
        const response = await mediaService.listImages({
          userId: currentUser.id,
          deviceId: currentDeviceId,
        });
        const remoteImages = (Array.isArray(response.images) ? response.images : []).map((image) => ({
          ...image,
          url: image.path ? mediaService.getStreamUrl({ path: image.path }) : image.url,
        }));
        setImages(remoteImages);
        return;
      }

      const imageFiles = [];
      const scanDirectory = async (dirPath) => {
        const items = await FileSystem.readDirectoryAsync(dirPath);
        for (const item of items) {
          if (item.startsWith('.')) continue; // Ignore hidden files/folders
          const itemPath = `${dirPath}${item}`;
          const info = await FileSystem.getInfoAsync(itemPath);
          if (info.isDirectory) {
            await scanDirectory(itemPath + '/');
          } else {
            const ext = item.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
              imageFiles.push({
                id: itemPath,
                url: itemPath,
                title: item,
                path: itemPath,
                is_remote: false,
              });
            }
          }
        }
      };
      
      const baseDir = getStorageDir() || '';
      if (baseDir) {
        await scanDirectory(baseDir);
      }
      setImages(imageFiles);
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetWallpaper = () => {
    if (selectedIndex !== null) {
      updateWallpaper(images[selectedIndex].url);
      closeImage();
    }
  };

  const openImage = (index) => {
    setSelectedIndex(index);
  };

  const closeImage = () => {
    setSelectedIndex(null);
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const handlePrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleDelete = async () => {
    if (selectedIndex !== null) {
      try {
        const imageToDelete = images[selectedIndex];
        if (hasApiContext && imageToDelete.is_remote && imageToDelete.path) {
          await mediaService.deleteMedia({ path: imageToDelete.path });
        } else {
          await FileSystem.deleteAsync(imageToDelete.url);
        }
        
        const newImages = [...images];
        newImages.splice(selectedIndex, 1);
        setImages(newImages);
        if (newImages.length === 0) {
          closeImage();
        } else if (selectedIndex >= newImages.length) {
          setSelectedIndex(newImages.length - 1);
        }
      } catch (error) {
        console.error('Failed to delete image:', error);
      }
    }
  };

  const renderGridItem = ({ item, index }) => (
    <TouchableOpacity 
      style={styles.gridItem} 
      onPress={() => openImage(index)}
      activeOpacity={0.8}
    >
      <Image source={{ uri: item.url }} style={styles.gridImage} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gallery</Text>
        <View style={{ width: 28 }} />
      </View>

      {isLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.emptyText}>Loading photos...</Text>
        </View>
      ) : (
        <FlatList
          data={images}
          keyExtractor={item => item.id}
          numColumns={3}
          renderItem={renderGridItem}
          contentContainerStyle={styles.gridContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={64} color="#334155" />
              <Text style={styles.emptyText}>No Photos</Text>
            </View>
          }
        />
      )}

      {/* Fullscreen View */}
      <Modal visible={selectedIndex !== null} transparent={true} animationType="fade">
        <View style={styles.fullScreenContainer}>
          <SafeAreaView style={styles.fullScreenSafeArea}>
            <View style={styles.fullScreenHeader}>
              <TouchableOpacity onPress={closeImage} style={styles.fullScreenCloseBtn}>
                <Ionicons name="close" size={28} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.fullScreenCounter}>
                {selectedIndex !== null ? `${selectedIndex + 1} / ${images.length}` : ''}
              </Text>
              <View style={{ width: 28 }} />
            </View>

            <View style={styles.fullScreenImageContainer}>
              {selectedIndex !== null && (
                <>
                  <Image 
                    source={{ uri: images[selectedIndex]?.url }} 
                    style={styles.fullScreenImage} 
                    resizeMode="contain" 
                  />
                  
                  {selectedIndex > 0 && (
                    <TouchableOpacity onPress={handlePrev} style={[styles.navBtnOverlay, styles.navBtnLeft]}>
                      <Ionicons name="chevron-back" size={32} color="#ffffff" />
                    </TouchableOpacity>
                  )}
                  
                  {selectedIndex < images.length - 1 && (
                    <TouchableOpacity onPress={handleNext} style={[styles.navBtnOverlay, styles.navBtnRight]}>
                      <Ionicons name="chevron-forward" size={32} color="#ffffff" />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            <View style={styles.fullScreenActions}>
              <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleSetWallpaper}>
                <Text style={styles.actionBtnPrimaryText}>Set as wallpaper</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnDanger} onPress={handleDelete}>
                <Ionicons name="trash" size={24} color="#fca5a5" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Bottom Navigation Bar */}
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
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    zIndex: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  gridContainer: {
    padding: 2,
    flexGrow: 1,
  },
  gridItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: height * 0.3,
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 16,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullScreenSafeArea: {
    flex: 1,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    height: 60,
  },
  fullScreenCloseBtn: {
    padding: 4,
  },
  fullScreenCounter: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  fullScreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fullScreenImage: {
    width: width,
    height: '100%',
  },
  navBtnOverlay: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnLeft: {
    left: 16,
  },
  navBtnRight: {
    right: 16,
  },
  fullScreenActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnPrimaryText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    paddingHorizontal: 20,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
