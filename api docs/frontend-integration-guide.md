# Role-Aware Authentication System - Frontend Integration Guide

## Quick Start for Frontend Developers

This guide provides everything needed to integrate the new unified role-aware authentication system into your Next.js/React frontend.

---

## System Overview

**Two separate login endpoints for different user types:**

| User Type | Endpoint | Use Case |
|-----------|----------|----------|
| Admin-level (Self-serve + Enterprise) | `POST /api/auth/login` | Individual users & company representatives |
| Internal users (Agents + Supervisors) | `POST /api/internal/login` | Field staff & team leads |

---

## Implementation Steps

### 1. Create Auth Service Hook

```typescript
// src/hooks/useAuth.ts

import { useState, useCallback } from 'react';

interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    token_type: string;
    user_type?: string;
    internal_role?: string;
    user: {
      id: number;
      email: string;
      name: string;
      internal_role?: string;
    };
  };
}

interface AuthError {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}

export const useAuth = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginAsAdmin = useCallback(
    async (email: string, password: string): Promise<LoginResponse | null> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        const data: LoginResponse | AuthError = await response.json();

        if (!response.ok) {
          const errorData = data as AuthError;
          setError(errorData.message);
          return null;
        }

        return data as LoginResponse;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Login failed';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loginAsInternal = useCallback(
    async (email: string, password: string): Promise<LoginResponse | null> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/internal/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        const data: LoginResponse | AuthError = await response.json();

        if (!response.ok) {
          const errorData = data as AuthError;
          setError(errorData.message);
          return null;
        }

        return data as LoginResponse;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Login failed';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    loginAsAdmin,
    loginAsInternal,
  };
};
```

### 2. Create Auth Context

```typescript
// src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useCallback } from 'react';

interface User {
  id: number;
  email: string;
  name: string;
  internal_role?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  userType: 'admin' | 'internal' | null;
  isAuthenticated: boolean;
  login: (token: string, user: User, userType: 'admin' | 'internal') => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUserState] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  });

  const [userType, setUserType] = useState<'admin' | 'internal' | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('user_type');
    return (stored as 'admin' | 'internal') ?? null;
  });

  const login = useCallback(
    (newToken: string, newUser: User, type: 'admin' | 'internal') => {
      localStorage.setItem('auth_token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      localStorage.setItem('user_type', type);

      setToken(newToken);
      setUserState(newUser);
      setUserType(type);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('user_type');

    setToken(null);
    setUserState(null);
    setUserType(null);
  }, []);

  const setUser = useCallback((newUser: User) => {
    localStorage.setItem('user', JSON.stringify(newUser));
    setUserState(newUser);
  }, []);

  const value: AuthContextType = {
    user,
    token,
    userType,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    setUser,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};
```

### 3. Create Login Component

```typescript
// src/components/LoginForm.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAuthContext } from '@/context/AuthContext';

type LoginMode = 'admin' | 'internal';

export const LoginForm: React.FC = () => {
  const router = useRouter();
  const { loginAsAdmin, loginAsInternal, loading, error } = useAuth();
  const { login } = useAuthContext();

  const [mode, setMode] = useState<LoginMode>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }

    try {
      let result;

      if (mode === 'admin') {
        result = await loginAsAdmin(email, password);
      } else {
        result = await loginAsInternal(email, password);
      }

      if (result?.data) {
        const { token, user, user_type, internal_role } = result.data;

        // Store in context
        login(
          token,
          user,
          mode === 'admin' ? 'admin' : 'internal'
        );

        // Redirect based on user type
        if (mode === 'admin') {
          router.push('/dashboard');
        } else {
          router.push('/agent-dashboard');
        }
      } else if (error) {
        setLocalError(error);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Sign in to The Factory
          </h2>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setMode('admin')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
              mode === 'admin'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Admin Login
          </button>
          <button
            onClick={() => setMode('internal')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
              mode === 'internal'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Agent/Supervisor
          </button>
        </div>

        {/* Error message */}
        {(localError || error) && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{localError || error}</p>
          </div>
        )}

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        {/* Mode info */}
        <div className="text-center text-sm text-gray-600">
          {mode === 'admin' ? (
            <p>Login for admins and company representatives</p>
          ) : (
            <p>Login for agents and supervisors</p>
          )}
        </div>
      </div>
    </div>
  );
};
```

### 4. Create Protected Route Component

```typescript
// src/components/ProtectedRoute.tsx

'use client';

import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'internal';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
}) => {
  const router = useRouter();
  const { isAuthenticated, userType } = useAuthContext();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (requiredRole && userType !== requiredRole) {
      router.push('/unauthorized');
      return;
    }
  }, [isAuthenticated, userType, requiredRole, router]);

  if (!isAuthenticated) {
    return <div>Redirecting to login...</div>;
  }

  if (requiredRole && userType !== requiredRole) {
    return <div>Unauthorized access</div>;
  }

  return <>{children}</>;
};
```

### 5. Create API Client with Auth

```typescript
// src/lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface ApiOptions extends RequestInit {
  token?: string;
}

export async function apiCall<T = any>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  // Add auth token if provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// Authenticated API call helper
export async function authenticatedApiCall<T = any>(
  endpoint: string,
  token: string,
  options: ApiOptions = {}
): Promise<T> {
  return apiCall<T>(endpoint, {
    ...options,
    token,
  });
}
```

### 6. Usage in Pages/Components

```typescript
// src/app/(dashboard)/task-list.tsx

'use client';

import { useEffect, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { authenticatedApiCall } from '@/lib/api';
import { ProtectedRoute } from '@/components/ProtectedRoute';

interface Task {
  id: number;
  title: string;
  status: string;
}

export default function TaskList() {
  const { token } = useAuthContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const fetchTasks = async () => {
      try {
        const response = await authenticatedApiCall<{
          success: boolean;
          data: Task[];
        }>('/tasks', token);

        if (response.success) {
          setTasks(response.data);
        }
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [token]);

  return (
    <ProtectedRoute requiredRole="internal">
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Tasks</h1>

        {loading ? (
          <p>Loading...</p>
        ) : tasks.length === 0 ? (
          <p>No tasks assigned</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="p-4 border border-gray-300 rounded-lg"
              >
                <p className="font-semibold">{task.title}</p>
                <p className="text-sm text-gray-600">{task.status}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ProtectedRoute>
  );
}
```

---

## Common Integration Patterns

### Redirect Users to Correct Dashboard

```typescript
const redirect = (userType: string, internalRole?: string) => {
  if (userType === 'admin') {
    router.push('/dashboard');
  } else if (userType === 'internal') {
    if (internalRole === 'supervisor') {
      router.push('/supervisor-dashboard');
    } else {
      router.push('/agent-dashboard');
    }
  }
};
```

### Handle Logout

```typescript
const handleLogout = () => {
  logout();
  router.push('/login');
};
```

### Check User Permissions

```typescript
const canAccessResource = (
  userType: string,
  internalRole?: string,
  requiredRole?: string
) => {
  if (requiredRole === 'admin') {
    return userType === 'admin';
  }
  if (requiredRole === 'supervisor') {
    return userType === 'internal' && internalRole === 'supervisor';
  }
  if (requiredRole === 'agent') {
    return userType === 'internal' && internalRole === 'agent';
  }
  return true;
};
```

---

## Error Handling Examples

### Handle Rate Limiting

```typescript
if (response.status === 429) {
  setError('Too many login attempts. Please try again in 1 minute.');
  // Show cooldown timer
}
```

### Handle Invalid Role Access

```typescript
if (response.status === 403) {
  setError('Invalid login endpoint for your user type. Please use the correct login option.');
  // Redirect to appropriate login tab
}
```

### Handle Validation Errors

```typescript
if (response.status === 422) {
  const data = await response.json();
  const errors = data.errors;
  // Display field-level errors
  if (errors.email) {
    setError(errors.email[0]);
  }
}
```

---

## Testing

### Test Admin Login

```typescript
// cypress/e2e/auth.cy.ts

describe('Admin Login', () => {
  it('should login as self-serve admin', () => {
    cy.visit('/login');
    
    // Select admin tab (should be default)
    cy.contains('Admin Login').should('have.class', 'active');
    
    // Fill form
    cy.get('input[name="email"]').type('user@example.com');
    cy.get('input[name="password"]').type('password123');
    
    // Submit
    cy.get('button[type="submit"]').click();
    
    // Should redirect to dashboard
    cy.url().should('include', '/dashboard');
  });
});
```

### Test Internal Login

```typescript
describe('Internal Login', () => {
  it('should login as agent', () => {
    cy.visit('/login');
    
    // Switch to internal tab
    cy.contains('Agent/Supervisor').click();
    
    // Fill form
    cy.get('input[name="email"]').type('agent@example.com');
    cy.get('input[name="password"]').type('password123');
    
    // Submit
    cy.get('button[type="submit"]').click();
    
    // Should redirect to agent dashboard
    cy.url().should('include', '/agent-dashboard');
  });
});
```

---

## Troubleshooting

### User Login Returns 401

**Problem**: User gets "Invalid credentials" error

**Check**:
1. Email and password are correct
2. User account is active (`is_active = true`)
3. User has completed onboarding
4. Using correct endpoint for user's role

```sql
-- Debug query
SELECT id, email, is_active, internal_role, 
       onboarding_completed_at, enterprise_onboarding_completed_at,
       onboarding_status
FROM users 
WHERE email = 'user@example.com';
```

### Admin User Cannot Use Internal Endpoint

**Problem**: Admin user tries to login via `/api/internal/login` and gets 401

**Expected Behavior**: ✅ Use `/api/auth/login` instead

**Root Cause**: User has `internal_role = NULL`, which indicates admin-level user

### Internal User Cannot Use Admin Endpoint

**Problem**: Agent tries to login via `/api/auth/login` and gets 401

**Expected Behavior**: ✅ Use `/api/internal/login` instead

**Root Cause**: User has `internal_role` set to 'agent' or 'supervisor'

### Rate Limiting Returns 429

**Problem**: User gets "Too Many Requests" error

**Expected**: Max 10 login attempts per 1 minute per IP

**Solution**: Wait 1 minute before retrying

### Token Expires After 30 Days

**Problem**: Old token stops working

**Expected Behavior**: ✅ This is normal

**Solution**: User must login again to get new token

---

## Endpoints Reference

### Admin Login
```
POST /api/auth/login
Request:  { email, password }
Response: { token, token_type, user_type, user }
```

### Internal Login
```
POST /api/internal/login
Request:  { email, password }
Response: { token, token_type, internal_role, user }
```

### Get Current User
```
GET /api/user/me
Headers:  Authorization: Bearer <token>
Response: { user data }
```

### List Tasks (Authenticated)
```
GET /api/tasks
Headers:  Authorization: Bearer <token>
Response: { tasks }
```

---

## Additional Resources

- [API Documentation](./features/authentication.md)
- [Architecture Design](./authentication-architecture.md)
- [Backend Repository](https://github.com/your-org/factory-backend)

