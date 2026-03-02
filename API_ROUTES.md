# API Routes Reference

When you install **flask-headless-auth** on your backend, you get **20+ authentication routes** out of the box. No configuration needed.

## 🎯 Quick Setup

### Backend (5 lines):
```python
from flask import Flask
from flask_headless_auth import AuthSvc

app = Flask(__name__)
auth = AuthSvc(app, url_prefix='/api/auth')  # That's it!
```

### Frontend (1 line):
```tsx
<AuthProvider config={{ apiBaseUrl: 'http://localhost:5000' }}>
```

**Done!** All routes below are now available.

---

## 📋 Available Routes

### Authentication

| Route | Method | Description | Request Body | Response |
|-------|--------|-------------|--------------|----------|
| `/register` | POST | Register new user | `{ email, password, first_name?, last_name? }` | `{ user, access_token, refresh_token }` |
| `/login` | POST | Login with email/password | `{ email, password }` | `{ user, access_token, refresh_token }` |
| `/logout` | POST | Logout (blacklist token) | - | `{ msg: "Successfully logged out" }` |
| `/check-auth` | GET | Check if user is authenticated | - | `{ msg, user: { email, id, role } }` |
| `/token/refresh` | POST | Refresh access token | - | `{ access_token, refresh_token }` |

### OAuth (Google & Microsoft)

| Route | Method | Description | Query Params | Response |
|-------|--------|-------------|--------------|----------|
| `/login/google` | GET | Initiate Google OAuth | `redirect_uri` | Redirect to Google |
| `/auth/google/callback` | GET | Google OAuth callback | `code, state` | Redirect with tokens |
| `/login/microsoft` | GET | Initiate Microsoft OAuth | `redirect_uri` | Redirect to Microsoft |
| `/auth/microsoft/callback` | GET | Microsoft OAuth callback | `code, state` | Redirect with tokens |

### User Management

| Route | Method | Description | Request Body | Response |
|-------|--------|-------------|--------------|----------|
| `/user/@me` | GET | Get current user details | - | `{ user: { id, email, first_name, ... } }` |
| `/update_user` | POST | Update user profile | `{ first_name?, last_name?, phone_number?, ... }` | `{ user, msg }` |
| `/upload-profile-picture` | POST | Upload profile picture | `FormData: { profile_picture: File }` | `{ profile_picture_url }` |

### Email Verification

| Route | Method | Description | Request Body | Response |
|-------|--------|-------------|--------------|----------|
| `/confirm/<token>` | GET | Confirm email address | - | `{ msg, user }` |
| `/resend-verification-email` | POST | Resend verification email | - | `{ msg }` |

### Multi-Factor Authentication

| Route | Method | Description | Request Body | Response |
|-------|--------|-------------|--------------|----------|
| `/verify-mfa` | POST | Verify MFA token | `{ email, token }` | `{ user, access_token, refresh_token }` |

### Password Management

| Route | Method | Description | Request Body | Response |
|-------|--------|-------------|--------------|----------|
| `/request-password-reset` | POST | Request password reset | `{ email }` | `{ msg }` |
| `/password/update` | POST | Update password | `{ current_password, new_password }` | `{ msg }` |

### Protected Routes (Example)

| Route | Method | Description | Headers | Response |
|-------|--------|-------------|---------|----------|
| `/protected` | GET | Example protected route | `Authorization: Bearer <token>` or Cookie | `{ msg, user_id, role }` |

---

## 🔐 Authentication Methods

All routes automatically support **both** authentication methods:

1. **httpOnly Cookies** (default, most secure)
   ```tsx
   fetch('/api/auth/user/@me', {
     credentials: 'include'  // Cookies sent automatically
   });
   ```

2. **localStorage Fallback** (when cookies blocked)
   ```tsx
   // Library handles this automatically
   // Sends Authorization: Bearer <token> header
   ```

---

## 💡 Usage Examples

### Login

```tsx
const { login } = useAuth();

const result = await login('user@example.com', 'password123');

if (result.success) {
  // User logged in, tokens stored automatically
  console.log(result.user);
}
```

**Backend handles:**
- Password validation (bcrypt)
- Token generation (JWT)
- Cookie/localStorage delivery
- MFA check (if enabled)
- Rate limiting

### Get User Profile

```tsx
const { user } = useAuth();

// User data fetched automatically on mount
console.log(user?.email, user?.first_name);
```

**Backend returns:**
```json
{
  "user": {
    "id": 123,
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "is_verified": true,
    "role_id": 2,
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

### Update Profile

```tsx
const { updateUser } = useAuth();

await updateUser({
  first_name: 'Jane',
  phone_number: '+1234567890'
});
```

### Google Login

```tsx
const { googleLogin } = useAuth();

// Redirects to Google OAuth
googleLogin('/dashboard');
```

**Backend handles:**
- OAuth redirect
- Token exchange
- User creation/update
- Token delivery
- Redirect back to frontend

### Logout

```tsx
const { logout } = useAuth();

await logout();
// Tokens blacklisted, cookies cleared, user logged out
```

---

## 🛡️ Security Features (Built-in)

All routes include:

- ✅ **httpOnly Cookies** - XSS-proof token storage
- ✅ **JWT Validation** - Automatic token verification
- ✅ **Token Blacklisting** - Revoked tokens can't be used
- ✅ **CSRF Protection** - SameSite cookie attributes
- ✅ **bcrypt Password Hashing** - Industry standard (cost factor 12)
- ✅ **Rate Limiting** - Prevent brute force attacks
- ✅ **Input Validation** - Sanitized inputs
- ✅ **SQL Injection Protection** - SQLAlchemy ORM

---

## 🎯 Backend Configuration (Optional)

Customize routes with configuration:

```python
app.config['AUTHSVC_ENABLE_MFA'] = True
app.config['AUTHSVC_ENABLE_RBAC'] = True
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)

# Email (deliver via hooks — register send_verification_email, send_password_reset_email hooks)
app.config['FRONTEND_URL'] = 'http://localhost:3000'

# OAuth
app.config['GOOGLE_CLIENT_ID'] = 'your-google-client-id'
app.config['GOOGLE_CLIENT_SECRET'] = 'your-google-client-secret'
```

---

## 📚 Complete Example

See [EXAMPLE.md](./EXAMPLE.md) for a working React + Flask example with all routes.

---

**Need help?** Open an issue on [GitHub](https://github.com/Dhruvagnihotri/react-headless-auth/issues)
