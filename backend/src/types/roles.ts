export type UserRole = 'owner' | 'admin' | 'moderator' | 'user' | 'viewer';

export interface UserProfile {
  id: string;
  email?: string;
  role: UserRole;
  username?: string;
  full_name?: string;
  created_at?: string;
  updated_at?: string;
  last_seen?: string;
}

export interface RoleChangeRequest {
  targetUserId: string;
  newRole: UserRole;
  reason?: string; // Audit için
}

export interface RoleChangeResponse {
  success: boolean;
  previousRole: UserRole;
  newRole: UserRole;
  changedAt: string;
}

