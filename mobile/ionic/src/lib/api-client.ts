import axios from 'axios';
import { Preferences } from '@capacitor/preferences';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use(async (config) => {
  const { value: token } = await Preferences.get({ key: 'mrt_token' });
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await Preferences.remove({ key: 'mrt_token' });
      // In a real app, we'd trigger a logout event or redirect to login
    }
    return Promise.reject(error);
  }
);

export default api;
