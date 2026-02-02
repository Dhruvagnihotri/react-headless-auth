# 🚀 Complete Working Example: React + Flask Auth in 5 Minutes

This example shows how ridiculously easy it is to set up full authentication.

## 📁 Project Structure

```
my-app/
├── backend/          # Flask API
│   ├── app.py       # 10 lines of code
│   └── requirements.txt
└── frontend/         # React App
    ├── src/
    │   ├── App.tsx   # 30 lines of code
    │   └── main.tsx
    └── package.json
```

---

## 🐍 Backend (Flask) - 10 Lines

### 1. Install

```bash
pip install flask-headless-auth flask-cors
```

### 2. Create `app.py`

```python
from flask import Flask
from flask_headless_auth import AuthSvc

app = Flask(__name__)

# Config (use environment variables in production!)
app.config['SECRET_KEY'] = 'dev-secret-key-change-in-production'
app.config['JWT_SECRET_KEY'] = 'dev-jwt-secret-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
app.config['AUTHSVC_CORS_ORIGINS'] = ['http://localhost:5173']  # Vite dev server

# Initialize auth - ONE LINE!
auth = AuthSvc(app)

if __name__ == '__main__':
    with app.app_context():
        auth.db.create_all()  # Create database tables
    app.run(debug=True, port=5000)
```

### 3. Run

```bash
python app.py
```

**✅ Done! Your backend now has 20+ auth endpoints:**
- `POST http://localhost:5000/api/auth/signup`
- `POST http://localhost:5000/api/auth/login`
- `POST http://localhost:5000/api/auth/logout`
- `GET http://localhost:5000/api/auth/user/@me`
- ... and more!

---

## ⚛️ Frontend (React) - 30 Lines

### 1. Install

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @headlesskits/react-headless-auth
```

### 2. Wrap app with `AuthProvider` (`src/main.tsx`)

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '@headlesskits/react-headless-auth';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider config={{ apiBaseUrl: 'http://localhost:5000' }}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
```

### 3. Use auth in components (`src/App.tsx`)

```tsx
import { useState } from 'react';
import { useAuth } from '@headlesskits/react-headless-auth';

function App() {
  const { user, login, signup, logout, loading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(email, password);
    if (!result.success) alert(result.error);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signup({ email, password });
    if (!result.success) alert(result.error);
  };

  if (loading) return <div>Loading...</div>;

  if (isAuthenticated && user) {
    return (
      <div>
        <h1>Welcome, {user.email}!</h1>
        <p>User ID: {user.id}</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Login / Signup</h1>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Login</button>
        <button type="button" onClick={handleSignup}>Signup</button>
      </form>
    </div>
  );
}

export default App;
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:5173

**✅ Done! You now have:**
- ✅ User signup
- ✅ User login
- ✅ Auto token refresh
- ✅ Secure httpOnly cookies
- ✅ Protected routes
- ✅ Session persistence

---

## 🎯 Try It Out

1. **Signup:** Enter email + password, click "Signup"
2. **Login:** Use the same credentials, click "Login"
3. **Authenticated:** See your user info
4. **Logout:** Click "Logout"
5. **Refresh Page:** Still logged in! (auto token refresh)

---

## 🔥 What You Get For Free

### Security
- ✅ httpOnly cookies (XSS-proof)
- ✅ CSRF protection
- ✅ Auto token refresh
- ✅ Token blacklisting on logout
- ✅ bcrypt password hashing

### Features
- ✅ User management
- ✅ Session persistence
- ✅ Error handling
- ✅ Loading states
- ✅ TypeScript types

### Backend Endpoints
```
POST /api/auth/signup              Register user
POST /api/auth/login               Login
POST /api/auth/logout              Logout
GET  /api/auth/user/@me            Get user
POST /api/auth/token/refresh       Refresh token
PUT  /api/auth/user/@me            Update user
POST /api/auth/password/update     Change password
```

---

## 🚀 Next Steps

### Add OAuth (5 more lines)

**Backend:**
```python
app.config['GOOGLE_CLIENT_ID'] = 'your-google-client-id'
app.config['GOOGLE_CLIENT_SECRET'] = 'your-google-client-secret'
```

**Frontend:**
```tsx
const { googleLogin } = useAuth();

<button onClick={() => googleLogin('/dashboard')}>
  Sign in with Google
</button>
```

### Add Protected Routes

```tsx
import { useAuth } from '@headlesskits/react-headless-auth';
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  
  return children;
}
```

### Add Email Verification

**Backend:**
```python
app.config['EMAIL_SERVICE'] = 'gmail'
app.config['MAIL_USERNAME'] = 'your-email@gmail.com'
app.config['MAIL_PASSWORD'] = 'your-app-password'
```

Now users get verification emails automatically!

### Add MFA/2FA

**Backend:** Already included! Just enable:
```python
app.config['AUTHSVC_ENABLE_MFA'] = True
```

**Frontend:**
```tsx
const { user } = useAuth();

if (user.mfa_enabled) {
  // Show MFA input
}
```

---

## 📦 Production Deployment

### Backend (Heroku)

```bash
# Add to requirements.txt
flask-headless-auth
gunicorn
psycopg2-binary

# Create Procfile
echo "web: gunicorn app:app" > Procfile

# Deploy
heroku create my-auth-api
heroku addons:create heroku-postgresql:mini
git push heroku main
```

### Frontend (Vercel)

```bash
npm install -g vercel
vercel
```

Update `.env.production`:
```
VITE_API_URL=https://my-auth-api.herokuapp.com
```

---

## 🎓 Full Example Repository

Clone our complete example with:
- ✅ Next.js 14 App Router
- ✅ Tailwind CSS styling
- ✅ Protected routes
- ✅ OAuth (Google, Microsoft)
- ✅ Email verification
- ✅ Password reset
- ✅ Profile management
- ✅ Role-based access

```bash
git clone https://github.com/Dhruvagnihotri/headlesskit-example
cd headlesskit-example
npm install
npm run dev
```

---

## 💡 Tips

### Debug Mode

```python
# Backend
app.config['DEBUG'] = True
```

```tsx
// Frontend
<AuthProvider config={{ debug: true, ... }}>
```

### Custom User Fields

```python
# Backend
from flask_headless_auth import UserMixin

class User(db.Model, UserMixin):
    __tablename__ = 'users'
    
    # Add custom fields
    first_name = db.Column(db.String(100))
    company = db.Column(db.String(200))

auth = AuthSvc(app, user_model=User)
```

```tsx
// Frontend - TypeScript types
interface CustomUser extends User {
  first_name: string;
  company: string;
}

const { user } = useAuth<CustomUser>();
console.log(user.first_name); // ✅ Typed!
```

---

## 🤔 Common Issues

### CORS Error?

**Backend:**
```python
app.config['AUTHSVC_CORS_ORIGINS'] = ['http://localhost:5173']
```

### Cookies Not Working?

**Frontend:**
```tsx
fetch('...', {
  credentials: 'include' // ← Important!
})
```

Or use our React package (handles this automatically).

### Token Expired?

Don't worry! Auto token refresh handles this. Just use `useAuth()` and forget about tokens.

---

## 🎉 That's It!

You now have production-ready authentication in **less than 50 lines of code total**.

No Auth0. No Clerk. No $300/month bills. Just simple, secure, self-hosted auth.

**Questions?** Open an issue on GitHub!

---

**⭐ If this saved you time, please star the repos!**

- [react-headless-auth](https://github.com/Dhruvagnihotri/react-headless-auth)
- [flask-headless-auth](https://github.com/Dhruvagnihotri/flask-headless-auth)
