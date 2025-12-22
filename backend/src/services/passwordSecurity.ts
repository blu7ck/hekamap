/**
 * Password Security Service
 * Checks passwords against HaveIBeenPwned database
 * Alternative to Supabase Pro plan's built-in leaked password protection
 */

import crypto from 'crypto';

export interface PasswordCheckResult {
  isLeaked: boolean;
  leakCount?: number; // Number of times password was found in breaches
}

export class PasswordSecurityService {
  /**
   * Check if password has been leaked using HaveIBeenPwned API
   * Uses k-Anonymity model (sends only first 5 chars of SHA-1 hash)
   */
  static async checkPasswordLeaked(password: string): Promise<PasswordCheckResult> {
    try {
      // Hash password with SHA-1 (HaveIBeenPwned uses SHA-1)
      const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);

      // Call HaveIBeenPwned Pwned Passwords API (k-Anonymity)
      // We only send the first 5 characters, API returns all hashes starting with that prefix
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: {
          'User-Agent': 'HekaMap-Password-Checker', // Required by API
        },
      });

      if (!response.ok) {
        console.warn('HaveIBeenPwned API error:', response.status);
        // If API fails, allow password (fail open for availability)
        return { isLeaked: false };
      }

      const responseText = await response.text();
      const lines = responseText.split('\n');

      // Check if our hash suffix exists in the response
      for (const line of lines) {
        const [hashSuffix, count] = line.split(':');
        if (hashSuffix.trim() === suffix) {
          return {
            isLeaked: true,
            leakCount: parseInt(count.trim(), 10) || 0,
          };
        }
      }

      // Password not found in breaches
      return { isLeaked: false };
    } catch (error: any) {
      console.error('Password leak check error:', error);
      // If check fails, allow password (fail open for availability)
      // In production, you might want to fail closed for stricter security
      return { isLeaked: false };
    }
  }

  /**
   * Validate password strength (additional checks beyond leak detection)
   */
  static validatePasswordStrength(password: string): {
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

    // Optional: Add more strength checks
    // if (!/[A-Z]/.test(password)) {
    //   errors.push('Password must contain at least one uppercase letter');
    // }
    // if (!/[a-z]/.test(password)) {
    //   errors.push('Password must contain at least one lowercase letter');
    // }
    // if (!/[0-9]/.test(password)) {
    //   errors.push('Password must contain at least one number');
    // }
    // if (!/[^A-Za-z0-9]/.test(password)) {
    //   errors.push('Password must contain at least one special character');
    // }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Combined password validation: strength + leak check
   */
  static async validatePassword(password: string): Promise<{
    valid: boolean;
    errors: string[];
    isLeaked: boolean;
    leakCount?: number;
  }> {
    // First check password strength
    const strengthCheck = this.validatePasswordStrength(password);
    if (!strengthCheck.valid) {
      return {
        valid: false,
        errors: strengthCheck.errors,
        isLeaked: false,
      };
    }

    // Then check if password is leaked
    const leakCheck = await this.checkPasswordLeaked(password);
    if (leakCheck.isLeaked) {
      return {
        valid: false,
        errors: [
          `This password has been found in ${leakCheck.leakCount || 0} data breaches. Please choose a different password.`,
        ],
        isLeaked: true,
        leakCount: leakCheck.leakCount,
      };
    }

    return {
      valid: true,
      errors: [],
      isLeaked: false,
    };
  }
}

