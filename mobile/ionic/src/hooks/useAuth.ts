import { useState, useEffect } from 'react';
import { Preferences } from '@capacitor/preferences';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    const { value: token } = await Preferences.get({ key: 'mrt_token' });
    setIsAuthenticated(!!token);
  };

  const login = async (token: string) => {
    await Preferences.set({ key: 'mrt_token', value: token });
    setIsAuthenticated(true);
  };

  const logout = async () => {
    await Preferences.remove({ key: 'mrt_token' });
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout, checkToken };
}
