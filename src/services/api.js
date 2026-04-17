import axios from 'axios';
import { Platform } from 'react-native';

// Physical devices must use the PC's LAN IP, not localhost.
// Ensure Laravel is running with: php artisan serve --host 0.0.0.0 --port 8000
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.18.2:8000/api';
export const WEB_BASE_URL = API_URL.replace(/\/api$/, '');

const LOCAL_API_URL = 'http://127.0.0.1:8000/api';
const API_BASE_URLS = Array.from(
  new Set([
    API_URL,
    ...(Platform.OS === 'web' ? [LOCAL_API_URL] : []),
  ])
);

const createClient = (baseURL) => axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

const apiClients = API_BASE_URLS.map(createClient);

const shouldTryNextBaseUrl = (error) => (
  !error?.response && ['ECONNABORTED', 'ERR_NETWORK'].includes(error?.code)
);

const request = async (config) => {
  let lastError;

  for (const client of apiClients) {
    try {
      return await client.request(config);
    } catch (error) {
      lastError = error;

      if (!shouldTryNextBaseUrl(error)) {
        throw error;
      }
    }
  }

  throw lastError;
};

const api = {
  get: (url, config) => request({ ...config, method: 'get', url }),
  post: (url, data, config) => request({ ...config, method: 'post', url, data }),
  delete: (url, config) => request({ ...config, method: 'delete', url }),
};

// Example API calls
export const phoneService = {
  // Fetch basic phone settings/apps
  getSettings: () => api.get('/phone/settings'),
  
  // Fetch music tracks
  getTracks: () => api.get('/music/tracks'),
};

export const authService = {
  register: async ({ name, email, password }) => {
    const response = await api.post('/auth/register', {
      name,
      email,
      password,
    });

    return response.data;
  },
  login: async ({ email, password }) => {
    const response = await api.post('/auth/login', {
      email,
      password,
    });

    return response.data;
  },
};

export const contactService = {
  list: async ({ userId }) => {
    const response = await api.get('/contacts', {
      params: {
        user_id: userId,
      },
    });

    return response.data;
  },
  save: async ({ userId, name, phoneNumber }) => {
    const response = await api.post('/contacts', {
      user_id: userId,
      name,
      phone_number: phoneNumber,
    });

    return response.data;
  },
  remove: async ({ userId, contactId }) => {
    const response = await api.delete('/contacts', {
      data: {
        user_id: userId,
        contact_id: contactId,
      },
    });

    return response.data;
  },
  lookup: async ({ phoneNumber }) => {
    const response = await api.get('/contacts/lookup', {
      params: {
        phone_number: phoneNumber,
      },
    });

    return response.data;
  },
};

export const callService = {
  current: async ({ userId }) => {
    const response = await api.get('/calls/current', {
      params: {
        user_id: userId,
      },
    });

    return response.data;
  },
  start: async ({ callerUserId, phoneNumber }) => {
    const response = await api.post('/calls/start', {
      caller_user_id: callerUserId,
      phone_number: phoneNumber,
    });

    return response.data;
  },
  accept: async ({ userId, sessionId }) => {
    const response = await api.post('/calls/accept', {
      user_id: userId,
      session_id: sessionId,
    });

    return response.data;
  },
  signal: async ({ userId, sessionId, offerSdp, answerSdp, iceCandidate }) => {
    const response = await api.post('/calls/signal', {
      user_id: userId,
      session_id: sessionId,
      ...(offerSdp ? { offer_sdp: offerSdp } : {}),
      ...(answerSdp ? { answer_sdp: answerSdp } : {}),
      ...(iceCandidate ? { ice_candidate: iceCandidate } : {}),
    });

    return response.data;
  },
  end: async ({ userId, sessionId, status }) => {
    const response = await api.post('/calls/end', {
      user_id: userId,
      session_id: sessionId,
      status,
    });

    return response.data;
  },
};

export const fileService = {
  list: async ({ userId, deviceId, folderPath = '' }) => {
    const response = await api.get('/files', {
      params: {
        user_id: userId,
        device_id: deviceId,
        folder_path: folderPath,
      },
    });

    return response.data;
  },
  upload: async ({ uri, name, mimeType, userId, deviceId, folderPath = '', onUploadProgress }) => {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name,
      type: mimeType || 'application/octet-stream',
    });
    formData.append('user_id', userId);
    formData.append('device_id', deviceId);
    formData.append('folder_path', folderPath);

    const response = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });

    return response.data;
  },
  createFolder: async ({ userId, deviceId, folderPath = '', name }) => {
    const response = await api.post('/files/folders', {
      user_id: userId,
      device_id: deviceId,
      folder_path: folderPath,
      name,
    });

    return response.data;
  },
  saveHtmlCompanion: async ({ userId, deviceId, path, html }) => {
    const response = await api.post('/files/html-companion', {
      user_id: userId,
      device_id: deviceId,
      path,
      html,
    });

    return response.data;
  },
  rename: async ({ userId, deviceId, path, name, type }) => {
    const response = await api.post('/files/rename', {
      user_id: userId,
      device_id: deviceId,
      path,
      name,
      type,
    });

    return response.data;
  },
  move: async ({ userId, deviceId, path, type, destinationFolderPath = '' }) => {
    const response = await api.post('/files/move', {
      user_id: userId,
      device_id: deviceId,
      path,
      type,
      destination_folder_path: destinationFolderPath,
    });

    return response.data;
  },
  copy: async ({ userId, deviceId, path, type, destinationFolderPath = '' }) => {
    const response = await api.post('/files/copy', {
      user_id: userId,
      device_id: deviceId,
      path,
      type,
      destination_folder_path: destinationFolderPath,
    });

    return response.data;
  },
  delete: async ({ userId, deviceId, path, type }) => {
    const response = await api.delete('/files', {
      data: {
        user_id: userId,
        device_id: deviceId,
        path,
        type,
      },
    });

    return response.data;
  },
  getDownloadUrl: ({ userId, deviceId, path }) => (
    `${API_URL}/files/download?user_id=${encodeURIComponent(userId)}&device_id=${encodeURIComponent(deviceId)}&path=${encodeURIComponent(path)}`
  ),
};

export const mediaService = {
  listMusic: async ({ userId, deviceId }) => {
    const response = await api.get('/media/music', {
      params: {
        user_id: userId,
        device_id: deviceId,
      },
    });

    return response.data;
  },
  listImages: async ({ userId, deviceId }) => {
    const response = await api.get('/media/images', {
      params: {
        user_id: userId,
        device_id: deviceId,
      },
    });

    return response.data;
  },
  deleteMedia: async ({ path }) => {
    const response = await api.delete('/media', {
      data: { path },
    });

    return response.data;
  },
};

export const paystackService = {
  initialize: async (payload) => {
    const response = await api.post('/payments/paystack/initialize', {
      ...payload,
      mobile_callback_url: `${WEB_BASE_URL}/paystack/mobile/callback`,
    });
    return response.data;
  },
  verify: async (reference) => {
    const response = await api.post('/payments/paystack/verify', { reference });
    return response.data;
  },
};

export default api;
