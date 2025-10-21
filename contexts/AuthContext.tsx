import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: { name: string; email: string } | null;
  login: (credentials: { email: string; password: string }) => Promise<boolean>;
  logout: () => void;
  showLogin: () => void;
  hideLogin: () => void;
  isLoginVisible: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [isLoginVisible, setIsLoginVisible] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('vision8_auth');
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth);
        setIsAuthenticated(true);
        setUser(authData.user);
      } catch (error) {
        console.error('Failed to parse saved auth data:', error);
        localStorage.removeItem('vision8_auth');
      }
    }
  }, []);

  const login = async (credentials: { email: string; password: string }): Promise<boolean> => {
    try {
      // Simulate API call - replace with actual authentication
      console.log('Attempting login with:', credentials.email);
      
      // For demo purposes, accept any email/password combination
      // In production, this would make an API call to your auth service
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      
      const userData = {
        name: credentials.email.split('@')[0],
        email: credentials.email
      };

      setIsAuthenticated(true);
      setUser(userData);
      setIsLoginVisible(false);

      // Save to localStorage for persistence
      localStorage.setItem('vision8_auth', JSON.stringify({
        user: userData,
        timestamp: Date.now()
      }));

      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('vision8_auth');
  };

  const showLogin = () => {
    setIsLoginVisible(true);
  };

  const hideLogin = () => {
    setIsLoginVisible(false);
  };

  const value: AuthContextType = {
    isAuthenticated,
    user,
    login,
    logout,
    showLogin,
    hideLogin,
    isLoginVisible
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};