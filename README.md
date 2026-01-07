# @headlesskit/react-auth

[![npm version](https://badge.fury.io/js/%40headlesskit%2Freact-auth.svg)](https://www.npmjs.com/package/@headlesskit/react-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Production-ready, headless authentication for React.** Pairs perfectly with [flask-headless-auth](https://pypi.org/project/flask-headless-auth/) backend.

## ✨ Features

- 🔐 **Complete Auth Flow** - Login, signup, OAuth, password reset
- 🍪 **Smart Token Storage** - Cookie-first with localStorage fallback
- 🔄 **Auto Token Refresh** - Seamless session management
- 🎣 **Extensibility Hooks** - Inject custom logic anywhere
- 📱 **React Native Support** - Same API, different storage
- 🎨 **Headless** - Bring your own UI
- 📦 **Tree-Shakeable** - Only import what you need
- 🔒 **TypeScript** - Full type safety
- ⚡ **Zero Dependencies** - Except React peer deps

## 📦 Installation

```bash
npm install @headlesskit/react-auth
# or
yarn add @headlesskit/react-auth
# or
pnpm add @headlesskit/react-auth
```

## 🚀 Quick Start

### 1. Wrap your app with AuthProvider

```tsx
// app/layout.tsx (Next.js App Router)
import { AuthProvider } from '@headlesskit/react-auth';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider
          config={{
            apiBaseUrl: process.env.NEXT_PUBLIC_API_URL!,
            apiPrefix: '/api/auth', // optional, this is the default
          }}
        >
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### 2. Use authentication in any component

```tsx
import { useAuth } from '@headlesskit/react-auth';

export function Profile() {
  const { user, logout, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Please login</div>;

  return (
    <div>
      <h1>Welcome {user.email}</h1>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## 📚 Core Concepts

### AuthProvider

The main component that provides authentication context to your app.

```tsx
<AuthProvider
  config={{
    apiBaseUrl: 'https://api.myapp.com',
    apiPrefix: '/api/auth', // default
    storageStrategy: 'cookie-first', // default: 'cookie-first' | 'localStorage-only'
    
    // OAuth (optional)
    enableGoogle: true,
    enableMicrosoft: true,
    
    // Analytics (optional)
    enablePostHog: true,
    posthogApiKey: 'your-key',
  }}
  
  // Lifecycle hooks (optional)
  hooks={{
    afterLogin: ({ user }) => {
      console.log('User logged in:', user.email);
      analytics.track('login', { userId: user.id });
    },
    
    transformUser: ({ user }) => ({
      ...user,
      displayName: `${user.first_name} ${user.last_name}`,
    }),
    
    onAuthError: ({ error }) => {
      toast.error(error.message);
    },
  }}
>
  {children}
</AuthProvider>
```

### useAuth Hook

Main hook for accessing all authentication functionality.

```tsx
const {
  // State
  isAuthenticated,
  loading,
  user,
  
  // Actions
  login,
  signup,
  logout,
  refreshUser,
  updateUser,
  updatePassword,
  googleLogin,
  microsoftLogin,
} = useAuth();
```

### useUser Hook

Focused hook for user data operations.

```tsx
const { user, refreshUser, updateUser, isLoading } = useUser();

// Update user profile
await updateUser({
  first_name: 'John',
  last_name: 'Doe',
});
```

### useSession Hook

Hook for session management.

```tsx
const {
  isAuthenticated,
  loading,
  isRefreshingToken,
  refreshToken,
  checkAuth,
} = useSession();
```

## 🎯 Usage Examples

### Login Form

```tsx
import { useAuth } from '@headlesskit/react-auth';
import { useState } from 'react';

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = await login(email, password);
    
    if (result.success) {
      // Redirect or show success message
      router.push('/dashboard');
    } else {
      alert(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

### Protected Route

```tsx
import { useAuth } from '@headlesskit/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
```

### OAuth Login

```tsx
import { useAuth } from '@headlesskit/react-auth';

export function OAuthButtons() {
  const { googleLogin, microsoftLogin } = useAuth();

  return (
    <div>
      <button onClick={() => googleLogin('/dashboard')}>
        Sign in with Google
      </button>
      <button onClick={() => microsoftLogin('/dashboard')}>
        Sign in with Microsoft
      </button>
    </div>
  );
}
```

## 🔧 Advanced Configuration

### Custom Endpoints

```tsx
<AuthProvider
  config={{
    apiBaseUrl: 'https://api.myapp.com',
    endpoints: {
      login: '/auth/signin',
      logout: '/auth/signout',
      signup: '/auth/register',
      // ... other endpoints
    },
  }}
/>
```

### Extensibility Hooks

Execute custom logic at any point in the authentication flow:

```tsx
<AuthProvider
  hooks={{
    // Before operations
    beforeLogin: ({ email }) => {
      console.log('Attempting login for:', email);
    },
    
    beforeSignup: ({ email }) => {
      // Validate before signup
      if (!isValidEmail(email)) {
        throw new Error('Invalid email');
      }
    },
    
    // After operations
    afterLogin: ({ user, tokens }) => {
      // Custom post-login logic
      analytics.track('login', { userId: user.id });
      localStorage.setItem('last_login', new Date().toISOString());
    },
    
    afterLogout: () => {
      // Clear app-specific data
      clearAppCache();
    },
    
    // Error handling
    onLoginError: ({ email, error }) => {
      // Custom error handling
      Sentry.captureException(error, { tags: { email } });
      toast.error(error.message);
    },
    
    // Transform data
    transformUser: ({ user }) => ({
      ...user,
      // Add computed fields
      fullName: `${user.first_name} ${user.last_name}`,
      avatar: user.profile_picture || '/default-avatar.png',
      isAdmin: user.email.endsWith('@company.com'),
    }),
    
    // Token refresh
    onTokenRefresh: () => {
      console.log('Token refreshed');
    },
  }}
/>
```

## 📱 React Native Support

```tsx
import { AuthProvider } from '@headlesskit/react-auth/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function App() {
  return (
    <AuthProvider
      config={{
        apiBaseUrl: 'https://api.myapp.com',
        storageStrategy: 'localStorage-only', // No cookies on mobile
      }}
      storage={AsyncStorage}
    >
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
```

## 🏗️ Architecture

### Layered Design

```
┌─────────────────────────────────────┐
│   React Layer (Hooks + Context)    │
├─────────────────────────────────────┤
│   Core Layer (Framework-Agnostic)  │
├─────────────────────────────────────┤
│   Storage Layer (Adapters)         │
└─────────────────────────────────────┘
```

- **React Layer**: Hooks and Context for React apps
- **Core Layer**: Pure TypeScript logic (can be used in Node.js, Vue, etc.)
- **Storage Layer**: Pluggable storage adapters (localStorage, AsyncStorage, etc.)

### Token Storage Strategy

```
┌─────────────────────────────────────────────┐
│ 1. Cookie-First (Default - Most Secure)    │
│    - HttpOnly cookies (XSS-safe)            │
│    - Automatic with credentials: 'include'  │
│    - Zero localStorage usage                │
├─────────────────────────────────────────────┤
│ 2. localStorage Fallback (When needed)     │
│    - Cookies blocked detection              │
│    - Authorization header                   │
│    - Still functional, less secure          │
└─────────────────────────────────────────────┘
```

## 🔌 Backend Integration

Works seamlessly with [flask-headless-auth](https://pypi.org/project/flask-headless-auth/):

```python
# Backend setup (Flask)
from flask_headless_auth import AuthSvc

auth = AuthSvc(
    app,
    user_model=User,
    url_prefix='/api/auth'  # Match your frontend config
)
```

```typescript
// Frontend setup
<AuthProvider
  config={{
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL,
    apiPrefix: '/api/auth', // Must match backend
  }}
/>
```

## 📖 API Reference

### AuthProvider Props

```typescript
interface AuthProviderProps {
  children: ReactNode;
  config: {
    apiBaseUrl: string;                   // Required
    apiPrefix?: string;                   // Default: '/api/auth'
    storageStrategy?: 'cookie-first' | 'localStorage-only';
    tokenRefreshInterval?: number;        // Default: 55 minutes
    enableGoogle?: boolean;
    enableMicrosoft?: boolean;
    customHeaders?: Record<string, string>;
    debug?: boolean;
  };
  hooks?: {
    beforeLogin?: (data) => void;
    afterLogin?: (data) => void;
    onLoginError?: (error) => void;
    // ... many more hooks
  };
  onReady?: () => void;
}
```

### User Type

```typescript
interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_verified: boolean;
  // ... many more fields
}
```

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License

MIT © HeadlessKit Contributors

## 🔗 Related Packages

- [flask-headless-auth](https://pypi.org/project/flask-headless-auth/) - Backend companion
- [@headlesskit/react-payments](https://www.npmjs.com/package/@headlesskit/react-payments) - Payment integration

## 💬 Support

- 📖 [Documentation](https://headlesskit.dev/docs/react-auth)
- 💬 [Discord Community](https://discord.gg/headlesskit)
- 🐛 [Issue Tracker](https://github.com/headlesskit/react-auth/issues)

---

**Built with ❤️ by the HeadlessKit team**
