# React Native Integration Guide

This guide shows how to use `@headlesskits/react-headless-auth` in React Native applications.

## Installation

```bash
npm install @headlesskits/react-headless-auth @react-native-async-storage/async-storage
```

## Setup

### 1. Create AuthProvider Wrapper

```typescript
// src/providers/AuthProvider.tsx
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider as HeadlessAuthProvider, AsyncStorageAdapter } from '@headlesskits/react-headless-auth';
import { apiConfig } from '../config/env';

// Create adapter instance
const asyncStorageAdapter = new AsyncStorageAdapter(AsyncStorage);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <HeadlessAuthProvider
      config={{
        apiBaseUrl: apiConfig.baseUrl,
        apiPrefix: apiConfig.endpoints.auth,
        storageStrategy: 'localStorage-only', // Use localStorage strategy for React Native
        debug: __DEV__, // Enable debug logging in development
        endpoints: {
          signup: '/register',
          updateUser: '/update_user',
          updatePassword: '/update_user',
        },
      }}
      storageAdapter={asyncStorageAdapter}
    >
      {children}
    </HeadlessAuthProvider>
  );
}
```

### 2. Wrap Your App

```typescript
// App.tsx
import { AuthProvider } from './src/providers/AuthProvider';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
```

### 3. Use in Components

```typescript
// src/screens/LoginScreen.tsx
import { useAuth } from '@headlesskits/react-headless-auth';

export function LoginScreen() {
  const { login, loading } = useAuth();
  
  const handleLogin = async () => {
    const response = await login(email, password);
    if (response.success) {
      navigation.navigate('Dashboard');
    }
  };
  
  return (
    <View>
      <TextInput value={email} onChangeText={setEmail} />
      <TextInput value={password} onChangeText={setPassword} secureTextEntry />
      <Button title="Login" onPress={handleLogin} disabled={loading} />
    </View>
  );
}
```

### 4. Making Authenticated API Calls

The library provides `createAuthFetch` for making authenticated requests to your custom endpoints:

```typescript
// src/services/api.ts
import { useAuth, createAuthFetch } from '@headlesskits/react-headless-auth';

export function useApi() {
  const { getAccessToken, refreshAccessToken } = useAuth();
  
  const authFetch = createAuthFetch({
    getAccessToken,
    refreshAccessToken,
    debug: __DEV__,
  });
  
  return {
    // Custom endpoint example
    fetchTranscriptions: async () => {
      const response = await authFetch(`${apiConfig.baseUrl}/api/transcriptions`);
      return response.json();
    },
    
    uploadAudio: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      
      const response = await authFetch(`${apiConfig.baseUrl}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      return response.json();
    },
  };
}
```

Or use in component directly:

```typescript
import { useAuth } from '@headlesskits/react-headless-auth';

function DashboardScreen() {
  const { getAccessToken } = useAuth();
  
  const fetchData = async () => {
    const token = await getAccessToken();
    
    const response = await fetch(`${apiConfig.baseUrl}/api/data`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    return response.json();
  };
}
```

## Features Available in React Native

✅ **All authentication features work identically:**
- Login/Signup
- Logout
- Token refresh (automatic)
- User profile management
- Password updates
- OAuth (Google, Microsoft)

✅ **Automatic token management:**
- Tokens stored in AsyncStorage
- Auto-refresh before expiration
- 401 retry logic

✅ **Same hooks as web:**
```typescript
const { 
  isAuthenticated,
  loading,
  user,
  login,
  signup,
  logout,
  updateUser,
  getAccessToken,
  refreshAccessToken,
} = useAuth();
```

## Platform-Specific Configuration

### iOS Simulator
```typescript
const apiConfig = {
  baseUrl: __DEV__ ? 'http://localhost:5000' : 'https://api.example.com',
};
```

### Android Emulator
```typescript
import { Platform } from 'react-native';

const apiConfig = {
  baseUrl: __DEV__ 
    ? Platform.select({
        ios: 'http://localhost:5000',
        android: 'http://10.0.2.2:5000', // Android emulator localhost
      })
    : 'https://api.example.com',
};
```

### Physical Devices (Development)
Use your computer's local network IP:
```typescript
const apiConfig = {
  baseUrl: __DEV__ ? 'http://192.168.1.100:5000' : 'https://api.example.com',
};
```

## Differences from Web

| Feature | Web | React Native |
|---------|-----|--------------|
| Token Storage | HTTP-only cookies (default) | AsyncStorage |
| Storage Strategy | `cookie-first` (default) | `localStorage-only` |
| Storage Adapter | `LocalStorageAdapter` | `AsyncStorageAdapter` |
| Auth Flow | Identical | Identical |
| API Calls | Identical | Identical |
| Hooks | Identical | Identical |

## Troubleshooting

### Tokens not persisting
Make sure you:
1. Created the `AsyncStorageAdapter` instance
2. Passed it to `AuthProvider` as `storageAdapter` prop
3. Set `storageStrategy: 'localStorage-only'`

### Network errors
- Check API URL is correct for your platform
- Android emulator: use `10.0.2.2` instead of `localhost`
- iOS simulator: use `localhost`
- Physical device: use network IP address

### Debug logging
Enable debug mode to see detailed logs:
```typescript
<AuthProvider
  config={{
    debug: true, // or __DEV__ for development only
    // ...
  }}
/>
```

## Migration from Workarounds

If you were using manual token storage workarounds:

**Before (Manual):**
```typescript
// ❌ Don't do this anymore
import './utils/localStorage-polyfill';
import './utils/debugAuth';
const token = localStorage.getItem('auth_access_token');
```

**After (Library Handles It):**
```typescript
// ✅ Use the library
import { useAuth } from '@headlesskits/react-headless-auth';
const { getAccessToken } = useAuth();
const token = await getAccessToken();
```

## Complete Example App Structure

```
myapp/
├── src/
│   ├── providers/
│   │   └── AuthProvider.tsx      # Setup adapter & config
│   ├── navigation/
│   │   └── AppNavigator.tsx      # Route based on auth status
│   ├── screens/
│   │   ├── LoginScreen.tsx       # Use useAuth() hook
│   │   ├── SignupScreen.tsx      # Use useAuth() hook
│   │   └── DashboardScreen.tsx   # Protected screen
│   ├── services/
│   │   └── api.ts                # Use createAuthFetch()
│   └── config/
│       └── env.ts                # API configuration
└── App.tsx                        # Wrap with AuthProvider
```

## Support

For issues or questions:
- GitHub: [your-repo-url]
- Documentation: [docs-url]
