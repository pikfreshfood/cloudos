import axios from 'axios';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

const SAF = FileSystem.StorageAccessFramework || null;
const API_SUFFIX = '/api';
const LIVE_HOST = 'https://cloudos.ng/';

const isSafUri = (uri = '') => (
  typeof uri === 'string' &&
  uri.startsWith('content://')
);

const readUploadFileAsBase64 = async (uri) => {
  const options = { encoding: FileSystem.EncodingType.Base64 };

  if (isSafUri(uri) && SAF?.readAsStringAsync) {
    return SAF.readAsStringAsync(uri, options);
  }

  return FileSystem.readAsStringAsync(uri, options);
};

const normalizeApiUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : `http://${raw}`;
  const trimmed = withProtocol.replace(/\/+$/, '');
  const base = trimmed.endsWith(API_SUFFIX) ? trimmed : `${trimmed}${API_SUFFIX}`;
  return `${base}/`;
};

const CONFIG_API_URL = Constants.expoConfig?.extra?.apiUrl || Constants.manifest?.extra?.apiUrl;

const getConfiguredApiUrl = () => {
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  return envApiUrl || CONFIG_API_URL || LIVE_HOST;
};

export let API_URL = normalizeApiUrl(getConfiguredApiUrl());
export let WEB_BASE_URL = API_URL.replace(/\/api\/$/, '');

const createClient = (baseURL) => axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

let apiClient = createClient(API_URL);

const request = async (config) => {
  return apiClient.request(config);
};

export const setApiBaseUrl = (value) => {
  const normalized = normalizeApiUrl(value);
  if (normalized) {
    API_URL = normalized;
    WEB_BASE_URL = normalized.replace(/\/api\/$/, '');
    apiClient = createClient(API_URL);
  }
};

const api = {
  get: (url, config) => request({ ...config, method: 'get', url }),
  post: (url, data, config) => request({ ...config, method: 'post', url, data }),
  patch: (url, data, config) => request({ ...config, method: 'patch', url, data }),
  delete: (url, config) => request({ ...config, method: 'delete', url }),
};

export const phoneService = {
  getSettings: () => api.get('phone/settings'),
  getTracks: () => api.get('music/tracks'),
};

export const authService = {
  register: async ({ name, email, phoneNumber, password }) => {
    const response = await api.post('auth/register', { name, email, phone_number: phoneNumber, password });
    return response.data;
  },
  login: async ({ email, password }) => {
    const response = await api.post('auth/login', { email, password });
    return response.data;
  },
  forgotPassword: async ({ email }) => {
    const response = await api.post('auth/forgot-password', { email });
    return response.data;
  },
  updateProfile: async ({ userId, name, password }) => {
    const response = await api.patch('auth/profile', {
      user_id: userId,
      name,
      ...(password ? { password } : {}),
    });
    return response.data;
  },
};

export const deviceService = {
  sync: async ({ userId, devices }) => {
    const response = await api.post('devices/sync', {
      user_id: Number(userId) || userId,
      devices: (devices || []).map((device) => ({
        device_id: device.id || device.deviceId,
        name: device.name,
        os: device.os,
        phone_number: device.phoneNumber || device.phone_number,
        storage: device.storage,
      })),
    });
    return response.data;
  },
  installedApps: async ({ userId, deviceId }) => {
    const response = await api.get('devices/installed-apps', {
      params: { user_id: userId, device_id: deviceId },
    });
    return response.data;
  },
  syncInstalledApps: async ({ userId, deviceId, apps }) => {
    const response = await api.post('devices/installed-apps/sync', {
      user_id: userId,
      device_id: deviceId,
      apps,
    });
    return response.data;
  },
  shareInstalledApps: async ({ senderUserId, senderDeviceId, recipientPhoneNumber, apps }) => {
    const response = await api.post('devices/installed-apps/share', {
      sender_user_id: senderUserId,
      sender_device_id: senderDeviceId,
      recipient_phone_number: recipientPhoneNumber,
      apps,
    });
    return response.data;
  },
  syncPushToken: async ({ userId, deviceId, phoneNumber, pushToken, platform }) => {
    const response = await api.post('devices/push-token', {
      user_id: userId,
      device_id: deviceId,
      phone_number: phoneNumber,
      push_token: pushToken,
      platform,
    });
    return response.data;
  },
};

export const contactService = {
  list: async ({ userId, deviceId }) => {
    const params = { user_id: userId };
    if (deviceId) params.device_id = deviceId;
    const response = await api.get('contacts', { params });
    return response.data;
  },
  save: async ({ userId, deviceId, name, phoneNumber }) => {
    const data = { user_id: userId, name, phone_number: phoneNumber };
    if (deviceId) data.device_id = deviceId;
    const response = await api.post('contacts', data);
    return response.data;
  },
  remove: async ({ userId, deviceId, contactId }) => {
    const data = { user_id: userId, contact_id: contactId };
    if (deviceId) data.device_id = deviceId;
    const response = await api.delete('contacts', { data });
    return response.data;
  },
  removeMany: async ({ userId, deviceId, contactIds }) => {
    const data = { user_id: userId, contact_ids: contactIds };
    if (deviceId) data.device_id = deviceId;
    const response = await api.delete('contacts/bulk', { data });
    return response.data;
  },
  lookup: async ({ phoneNumber }) => {
    const response = await api.get('contacts/lookup', { params: { phone_number: phoneNumber } });
    return response.data;
  },
};

export const messageService = {
  conversations: async ({ userId, ownerPhoneNumber }) => {
    const response = await api.get('messages', {
      params: { user_id: userId, owner_phone_number: ownerPhoneNumber },
    });
    return response.data;
  },
  unreadCount: async ({ userId, phoneNumber, peerPhoneNumber }) => {
    const response = await api.get('messages/unread-count', {
      params: {
        user_id: userId,
        phone_number: phoneNumber,
        ...(peerPhoneNumber ? { peer_phone_number: peerPhoneNumber } : {}),
      },
    });
    return response.data;
  },
  thread: async ({ userId, ownerPhoneNumber, peerPhoneNumber }) => {
    const response = await api.get('messages/thread', {
      params: { user_id: userId, owner_phone_number: ownerPhoneNumber, peer_phone_number: peerPhoneNumber },
    });
    return response.data;
  },
  send: async ({ userId, senderPhoneNumber, recipientPhoneNumber, body, attachment }) => {
    if (attachment?.uri) {
      const fileData = await FileSystem.readAsStringAsync(attachment.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const response = await api.post('messages', {
        user_id: userId,
        sender_phone_number: senderPhoneNumber,
        recipient_phone_number: recipientPhoneNumber,
        body: body || '',
        attachment_base64: fileData,
        attachment_name: attachment.name || 'chat-image.jpg',
        attachment_mime: attachment.mimeType || 'image/jpeg',
      }, { timeout: 60000 });
      return response.data;
    }

    const response = await api.post('messages', { user_id: userId, sender_phone_number: senderPhoneNumber, recipient_phone_number: recipientPhoneNumber, body });
    return response.data;
  },
  deleteThread: async ({ userId, ownerPhoneNumber, peerPhoneNumber }) => {
    const response = await api.delete('messages', {
      data: { user_id: userId, owner_phone_number: ownerPhoneNumber, peer_phone_number: peerPhoneNumber },
    });
    return response.data;
  },
  checkNumber: async ({ phoneNumber }) => {
    const response = await api.get('contacts/lookup', { params: { phone_number: phoneNumber } });
    return {
      exists: !!(response.data?.user || response.data?.device),
      id: response.data?.device?.user_id || response.data?.user?.id || null,
      name: response.data?.device?.name || response.data?.user?.name || null,
      phone_number: response.data?.device?.phone_number || response.data?.user?.phone_number || phoneNumber,
      device: response.data?.device || null,
      user: response.data?.user || null,
    };
  },
};

export const fileService = {
  list: async ({ userId, deviceId, folderPath = '' }) => {
    const response = await api.get('files', { params: { user_id: userId, device_id: deviceId, folder_path: folderPath } });
    return response.data;
  },
  uploadBase64: async ({ uri, name, mimeType, userId, deviceId, folderPath = '', onUploadProgress }) => {
    onUploadProgress?.({ loaded: 1, total: 3 });
    const fileData = await readUploadFileAsBase64(uri);
    onUploadProgress?.({ loaded: 2, total: 3 });

    const response = await api.post('files/upload-base64', {
      file_name: name,
      file_data: fileData,
      mime_type: mimeType || 'application/octet-stream',
      user_id: userId,
      device_id: deviceId,
      folder_path: folderPath,
    });

    onUploadProgress?.({ loaded: 3, total: 3 });
    return response.data;
  },
  upload: async ({ uri, name, mimeType, userId, deviceId, folderPath = '', onUploadProgress }) => {
    const formData = new FormData();
    formData.append('file', { uri, name, type: mimeType || 'application/octet-stream' });
    formData.append('user_id', userId);
    formData.append('device_id', deviceId);
    formData.append('folder_path', folderPath);
    onUploadProgress?.({ loaded: 1, total: 2 });

    const response = await fetch(`${API_URL}files/upload`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: formData,
    });

    const responseText = await response.text();
    let data = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = { message: responseText || 'Upload failed.' };
    }

    if (!response.ok) {
      const blockedByHost = response.status === 403 && /<!doctype html|<html/i.test(responseText || '');
      if (blockedByHost) {
        return fileService.uploadBase64({
          uri,
          name,
          mimeType,
          userId,
          deviceId,
          folderPath,
          onUploadProgress,
        });
      }

      const message = /<!doctype html|<html/i.test(data?.message || '')
        ? `Upload failed with status ${response.status}`
        : data?.message || `Upload failed with status ${response.status}`;
      const error = new Error(message);
      error.response = { status: response.status, data };
      throw error;
    }

    onUploadProgress?.({ loaded: 2, total: 2 });
    return data;
  },
  createFolder: async ({ userId, deviceId, folderPath = '', name }) => {
    const response = await api.post('files/folders', { user_id: userId, device_id: deviceId, folder_path: folderPath, name });
    return response.data;
  },
  saveHtmlCompanion: async ({ userId, deviceId, path, html }) => {
    const response = await api.post('files/html-companion', { user_id: userId, device_id: deviceId, path, html });
    return response.data;
  },
  rename: async ({ userId, deviceId, path, name, type }) => {
    const response = await api.post('files/rename', { user_id: userId, device_id: deviceId, path, name, type });
    return response.data;
  },
  move: async ({ userId, deviceId, path, type, destinationFolderPath = '' }) => {
    const response = await api.post('files/move', { user_id: userId, device_id: deviceId, path, type, destination_folder_path: destinationFolderPath });
    return response.data;
  },
  copy: async ({ userId, deviceId, path, type, destinationFolderPath = '' }) => {
    const response = await api.post('files/copy', { user_id: userId, device_id: deviceId, path, type, destination_folder_path: destinationFolderPath });
    return response.data;
  },
  share: async ({ userId, deviceId, recipientPhoneNumber, recipientUserId = null, recipientDeviceId = null, recipientDeviceStorage = null, items }) => {
    const response = await api.post('files/share', {
      user_id: userId,
      device_id: deviceId,
      recipient_phone_number: recipientPhoneNumber,
      ...(recipientUserId ? { recipient_user_id: recipientUserId } : {}),
      ...(recipientDeviceId ? { recipient_device_id: recipientDeviceId } : {}),
      ...(recipientDeviceStorage ? { recipient_device_storage: recipientDeviceStorage } : {}),
      items,
    });
    return response.data;
  },
  delete: async ({ userId, deviceId, path, type }) => {
    const response = await api.delete('files', { data: { user_id: userId, device_id: deviceId, path, type } });
    return response.data;
  },
  getDownloadUrl: ({ userId, deviceId, path }) => (`${API_URL}files/download?user_id=${encodeURIComponent(userId)}&device_id=${encodeURIComponent(deviceId)}&path=${encodeURIComponent(path)}`),
  createSyncFolderStructure: async ({ userId, deviceId, folderPath }) => {
    const response = await api.post('files/sync-folder-structure', { user_id: userId, device_id: deviceId, folder_path: folderPath });
    return response.data;
  },
};

export const appStoreService = {
  list: async ({ search = '' } = {}) => {
    const response = await api.get('app-store/apps', { params: search ? { search } : {} });
    return response.data;
  },
  reviews: async ({ appId }) => {
    const response = await api.get(`app-store/apps/${appId}/reviews`);
    return response.data;
  },
  submitReview: async ({ appId, userId, deviceId, rating, comment }) => {
    const response = await api.post(`app-store/apps/${appId}/reviews`, {
      user_id: userId,
      device_id: deviceId,
      rating,
      comment,
    });
    return response.data;
  },
};

export const mediaService = {
  listMusic: async ({ userId, deviceId }) => {
    const response = await api.get('media/music', { params: { user_id: userId, device_id: deviceId } });
    return response.data;
  },
  listImages: async ({ userId, deviceId }) => {
    const response = await api.get('media/images', { params: { user_id: userId, device_id: deviceId } });
    return response.data;
  },
  deleteMedia: async ({ path }) => {
    const response = await api.delete('media', { data: { path } });
    return response.data;
  },
  listStates: async ({ userId, mediaType }) => {
    const response = await api.get('media-states', {
      params: { user_id: userId, ...(mediaType ? { media_type: mediaType } : {}) },
    });
    return response.data;
  },
  getState: async ({ userId, mediaType, mediaPath }) => {
    const response = await api.get('media-states/show', {
      params: { user_id: userId, media_type: mediaType, media_path: mediaPath },
    });
    return response.data;
  },
  saveState: async ({
    userId,
    deviceId,
    mediaType,
    mediaPath,
    mediaTitle,
    positionMs,
    durationMs,
    playbackStatus,
    metadata,
  }) => {
    const response = await api.post('media-states', {
      user_id: userId,
      device_id: deviceId,
      media_type: mediaType,
      media_path: mediaPath,
      media_title: mediaTitle,
      position_ms: Math.max(0, Math.round(Number(positionMs) || 0)),
      duration_ms: Math.max(0, Math.round(Number(durationMs) || 0)),
      playback_status: playbackStatus,
      metadata: metadata || {},
    });
    return response.data;
  },
};

export const signalService = {
  send: async ({ senderPhoneNumber, receiverPhoneNumber, type, data }) => {
    const response = await api.post('signals', { type: 'send', sender: senderPhoneNumber, receiver: receiverPhoneNumber, signalType: type, data: typeof data === 'string' ? data : JSON.stringify(data) });
    return response.data;
  },
  receive: async ({ phoneNumber }) => {
    const response = await api.post('signals', { type: 'receive', user: phoneNumber });
    return response.data;
  },
  peek: async ({ phoneNumber }) => {
    const response = await api.post('signals', { type: 'peek', user: phoneNumber });
    return response.data;
  },
};

export const paystackService = {
  initialize: async (payload) => {
    const response = await api.post('payments/paystack/initialize', { ...payload, mobile_callback_url: `${WEB_BASE_URL}/paystack/mobile/callback` });
    return response.data;
  },
  verify: async (reference) => {
    const response = await api.post('payments/paystack/verify', { reference });
    return response.data;
  },
};

export default api;
