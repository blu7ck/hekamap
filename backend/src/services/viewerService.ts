import { getSupabaseClient } from '../lib/supabase.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface CreateViewerAccessRequest {
  projectId: string;
  assetId?: string; // Optional - null means project-level access
  email: string;
  pin: string; // 4-digit PIN
}

export interface ViewerAccessResponse {
  id: string;
  accessToken: string;
  email: string;
  projectId: string;
  assetId?: string;
  createdAt: string;
}

export class ViewerService {
  /**
   * Create viewer access with PIN
   * Only owner/admin can create viewer access
   */
  static async createViewerAccess(
    callerUserId: string,
    request: CreateViewerAccessRequest
  ): Promise<ViewerAccessResponse> {
    const supabase = getSupabaseClient();

    // Verify caller is owner or admin
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', callerUserId)
      .single();

    if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
      throw new Error('Only owner or admin can create viewer access');
    }

    // Verify project exists and caller owns it
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', request.projectId)
      .single();

    if (projectError || !project) {
      throw new Error('Project not found');
    }

    // Owner can always access, admin needs explicit permission check
    if (project.owner_id !== callerUserId && callerProfile.role !== 'owner') {
      throw new Error('You do not have permission to grant access to this project');
    }

    // If asset_id is provided, verify it exists and belongs to the project
    if (request.assetId) {
      const { data: asset, error: assetError } = await supabase
        .from('project_assets')
        .select('id, project_id')
        .eq('id', request.assetId)
        .eq('project_id', request.projectId)
        .single();

      if (assetError || !asset) {
        throw new Error('Asset not found or does not belong to this project');
      }
    }

    // Hash PIN
    const saltRounds = 10;
    const pinHash = await bcrypt.hash(request.pin, saltRounds);

    // Generate secure access token
    const accessToken = crypto.randomBytes(32).toString('hex');

    // Check if access already exists
    const { data: existingAccess } = await supabase
      .from('project_access')
      .select('id')
      .eq('project_id', request.projectId)
      .eq('email', request.email.toLowerCase().trim())
      .eq('asset_id', request.assetId || null)
      .maybeSingle();

    let viewerAccess;
    if (existingAccess) {
      // Update existing access
      const { data: updated, error: updateError } = await supabase
        .from('project_access')
        .update({
          access_token: accessToken,
          pin_hash: pinHash,
          pin_set_at: new Date().toISOString(),
          granted_by: callerUserId,
        })
        .eq('id', existingAccess.id)
        .select('id, access_token, email, project_id, asset_id, created_at')
        .single();
      
      if (updateError || !updated) {
        throw new Error(`Failed to update viewer access: ${updateError?.message || 'Unknown error'}`);
      }
      viewerAccess = updated;
    } else {
      // Insert new access
      const { data: inserted, error: insertError } = await supabase
        .from('project_access')
        .insert({
          project_id: request.projectId,
          asset_id: request.assetId || null,
          email: request.email.toLowerCase().trim(),
          granted_by: callerUserId,
          access_token: accessToken,
          pin_hash: pinHash,
          pin_set_at: new Date().toISOString(),
        })
        .select('id, access_token, email, project_id, asset_id, created_at')
        .single();

      if (insertError || !inserted) {
        throw new Error(`Failed to create viewer access: ${insertError?.message || 'Unknown error'}`);
      }
      viewerAccess = inserted;
    }


    return {
      id: viewerAccess.id,
      accessToken: viewerAccess.access_token,
      email: viewerAccess.email,
      projectId: viewerAccess.project_id,
      assetId: viewerAccess.asset_id || undefined,
      createdAt: viewerAccess.created_at,
    };
  }

  /**
   * Verify PIN and return access token info
   */
  static async verifyPin(
    accessToken: string,
    pin: string
  ): Promise<{ valid: boolean; accessInfo?: any }> {
    const supabase = getSupabaseClient();

    // Find access record
    const { data: access, error } = await supabase
      .from('project_access')
      .select('id, project_id, asset_id, email, pin_hash, expires_at')
      .eq('access_token', accessToken)
      .single();

    if (error || !access) {
      return { valid: false };
    }

    // Check expiration
    if (access.expires_at && new Date(access.expires_at) < new Date()) {
      return { valid: false };
    }

    // Verify PIN
    if (!access.pin_hash) {
      return { valid: false };
    }

    const pinValid = await bcrypt.compare(pin, access.pin_hash);
    if (!pinValid) {
      return { valid: false };
    }

    // Update access stats (increment access_count)
    const { data: currentAccess } = await supabase
      .from('project_access')
      .select('access_count')
      .eq('id', access.id)
      .single();

    await supabase
      .from('project_access')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (currentAccess?.access_count || 0) + 1,
      })
      .eq('id', access.id);

    return {
      valid: true,
      accessInfo: {
        projectId: access.project_id,
        assetId: access.asset_id,
        email: access.email,
      },
    };
  }

  /**
   * Get viewer access list for a project (owner/admin only)
   */
  static async listViewerAccess(
    callerUserId: string,
    projectId: string,
    assetId?: string
  ) {
    const supabase = getSupabaseClient();

    // Verify caller is owner or admin
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', callerUserId)
      .single();

    if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
      throw new Error('Only owner or admin can list viewer access');
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw new Error('Project not found');
    }

    if (project.owner_id !== callerUserId && callerProfile.role !== 'owner') {
      throw new Error('You do not have permission to view access for this project');
    }

    // Build query
    let query = supabase
      .from('project_access')
      .select('id, email, asset_id, created_at, last_accessed_at, access_count, expires_at')
      .eq('project_id', projectId);

    if (assetId) {
      query = query.eq('asset_id', assetId);
    } else {
      query = query.is('asset_id', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list viewer access: ${error.message}`);
    }

    return { viewers: data || [] };
  }

  /**
   * Delete viewer access (owner/admin only)
   */
  static async deleteViewerAccess(
    callerUserId: string,
    accessId: string
  ): Promise<void> {
    const supabase = getSupabaseClient();

    // Verify caller is owner or admin
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', callerUserId)
      .single();

    if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
      throw new Error('Only owner or admin can delete viewer access');
    }

    // Get access record to verify project ownership
    const { data: access } = await supabase
      .from('project_access')
      .select('project_id, project:projects(owner_id)')
      .eq('id', accessId)
      .single();

    if (!access) {
      throw new Error('Access record not found');
    }

    // Delete
    const { error } = await supabase
      .from('project_access')
      .delete()
      .eq('id', accessId);

    if (error) {
      throw new Error(`Failed to delete viewer access: ${error.message}`);
    }
  }
}

