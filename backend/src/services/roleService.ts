import { getSupabaseClient } from '../lib/supabase.js';
import type { UserRole, RoleChangeRequest, RoleChangeResponse } from '../types/roles.js';

export class RoleService {
  /**
   * Kullanıcı rolünü getirir
   */
  static async getUserRole(userId: string): Promise<UserRole> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return 'user'; // Default
    }

    return (data.role as UserRole) || 'user';
  }

  /**
   * Kullanıcı rolünü değiştirir (sadece owner yapabilir)
   */
  static async changeUserRole(
    callerUserId: string,
    request: RoleChangeRequest
  ): Promise<RoleChangeResponse> {
    const supabase = getSupabaseClient();

    // Caller'ın owner olduğunu kontrol et
    const callerRole = await this.getUserRole(callerUserId);
    if (callerRole !== 'owner') {
      throw new Error('Only owner can change user roles');
    }

    // Target user'ın mevcut rolünü al
    const { data: targetUser, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, role')
      .eq('id', request.targetUserId)
      .single();

    if (fetchError || !targetUser) {
      throw new Error('Target user not found');
    }

    const previousRole = targetUser.role as UserRole;

    // Owner sayısı kontrolü (sadece bir owner olabilir)
    if (request.newRole === 'owner') {
      const { count } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'owner')
        .neq('id', request.targetUserId);

      if ((count || 0) > 0) {
        throw new Error('There can only be one owner');
      }
    }

    // Aynı rolse değişiklik yapma
    if (previousRole === request.newRole) {
      return {
        success: true,
        previousRole,
        newRole: previousRole,
        changedAt: new Date().toISOString(),
      };
    }

    // Rolü güncelle (Supabase RPC fonksiyonunu kullan)
    const { error: updateError } = await supabase.rpc('set_user_role', {
      target_user: request.targetUserId,
      new_role: request.newRole,
    });

    if (updateError) {
      throw new Error(`Failed to update role: ${updateError.message}`);
    }

    // Audit log kaydet
    await this.logRoleChange({
      callerUserId,
      targetUserId: request.targetUserId,
      previousRole,
      newRole: request.newRole,
      reason: request.reason,
    });

    return {
      success: true,
      previousRole,
      newRole: request.newRole,
      changedAt: new Date().toISOString(),
    };
  }

  /**
   * Kullanıcı listesini getirir (paginated)
   */
  static async listUsers(page: number = 1, limit: number = 50) {
    const supabase = getSupabaseClient();

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('user_profiles')
      .select('id, email, role, username, full_name, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    return {
      users: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Belirli rolü olan kullanıcıları getirir
   */
  static async getUsersByRole(role: UserRole) {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, role, username, full_name, created_at')
      .eq('role', role)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch users by role: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Audit log kaydeder
   */
  private static async logRoleChange(params: {
    callerUserId: string;
    targetUserId: string;
    previousRole: UserRole;
    newRole: UserRole;
    reason?: string;
  }) {
    const supabase = getSupabaseClient();

    await supabase.from('security_events').insert({
      event_type: 'role_change',
      user_id: params.targetUserId,
      details: {
        caller_user_id: params.callerUserId,
        previous_role: params.previousRole,
        new_role: params.newRole,
        reason: params.reason,
      },
      severity: 'medium',
      resolved: false,
    });
  }
}

