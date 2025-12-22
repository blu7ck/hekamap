/**
 * Password Validation Utility
 * Checks password strength and leaks using backend API
 */

// Backend API URL helper
const getBackendApiUrl = (): string => {
  const env = import.meta.env as { VITE_BACKEND_API_URL?: string };
  return env.VITE_BACKEND_API_URL || 'http://localhost:3000';
};

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  isLeaked: boolean;
  leakCount?: number;
}

/**
 * Validate password using backend API
 * Checks password strength and if it's been leaked
 */
export async function validatePassword(password: string): Promise<PasswordValidationResult> {
  try {
    const backendUrl = getBackendApiUrl();
    const res = await fetch(`${backendUrl}/api/auth/validate-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      // If API fails, return basic validation
      return {
        valid: password.length >= 8,
        errors: password.length < 8 ? ['Password must be at least 8 characters long'] : [],
        isLeaked: false,
      };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Password validation error:', error);
    // Fail open for availability - return basic validation
    return {
      valid: password.length >= 8,
      errors: password.length < 8 ? ['Password must be at least 8 characters long'] : [],
      isLeaked: false,
    };
  }
}

/**
 * Simple client-side password strength check (for immediate feedback)
 * Full validation should be done via validatePassword()
 */
export function quickPasswordCheck(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

