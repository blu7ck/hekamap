import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getSupabaseAdmin, getSupabaseUserClient } from './supabase-admin';
import { getR2Client } from './r2-client';
import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

type Env = BaseEnv & {
  SUPABASE_SERVICE_ROLE_KEY: string; // Required for admin operations
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  const token = getBearerToken(context.request);
  if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const verified = await verifySupabaseToken(token, context.env);
  if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
  const userId = verified.payload.sub as string;

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const { project_id, asset_id } = body || {};
  if (!project_id || !asset_id) {
    return new Response('project_id and asset_id required', { status: 400 }) as unknown as CfResponse;
  }

  // Verify access by fetching asset with user-scoped client (RLS enforces access control)
  const supabaseUser = getSupabaseUserClient(context.env, token);
  const { data: asset, error: assetError } = await supabaseUser
    .from('project_assets')
    .select('id, project_id, asset_key, final_key, asset_type')
    .eq('id', asset_id)
    .eq('project_id', project_id)
    .single();

  if (assetError || !asset) {
    // RLS will return error if user doesn't have access, or asset doesn't exist
    if (assetError?.code === '42501' || assetError?.message?.includes('permission denied') || assetError?.message?.includes('RLS')) {
      return new Response('Forbidden: No access to this asset', { status: 403 }) as unknown as CfResponse;
    }
    return new Response('Asset not found', { status: 404 }) as unknown as CfResponse;
  }

  const s3 = getR2Client(context.env);
  const bucket = context.env.R2_PRIVATE_BUCKET;
  const deletedFiles: string[] = [];
  const errors: string[] = [];

  // Delete raw file
  if (asset.asset_key) {
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: asset.asset_key,
      }));
      deletedFiles.push(asset.asset_key);
    } catch (err: any) {
      console.error('Failed to delete raw file:', err);
      errors.push(`Raw file: ${err.message || 'Unknown error'}`);
    }
  }

  // Delete final file(s)
  if (asset.final_key) {
    try {
      // If it's a tileset, we need to delete the entire directory
      if (asset.asset_type === 'tileset' && asset.final_key.includes('tileset.json')) {
        // Extract directory path (e.g., "tiles/project_id/asset_id/" from "tiles/project_id/asset_id/tileset.json")
        const dirPath = asset.final_key.substring(0, asset.final_key.lastIndexOf('/') + 1);
        
        // List all objects in the directory
        let continuationToken: string | undefined;
        do {
          const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: dirPath,
            ContinuationToken: continuationToken,
          });
          
          const listResult = await s3.send(listCommand);
          
          if (listResult.Contents) {
            // Delete all objects in the directory
            for (const obj of listResult.Contents) {
              if (obj.Key) {
                try {
                  await s3.send(new DeleteObjectCommand({
                    Bucket: bucket,
                    Key: obj.Key,
                  }));
                  deletedFiles.push(obj.Key);
                } catch (err: any) {
                  console.error(`Failed to delete ${obj.Key}:`, err);
                  errors.push(`${obj.Key}: ${err.message || 'Unknown error'}`);
                }
              }
            }
          }
          
          continuationToken = listResult.NextContinuationToken;
        } while (continuationToken);
      } else if (asset.final_key.includes('models/')) {
        // For models directory, also check if there are related files (textures, etc.)
        // Extract directory path
        const dirPath = asset.final_key.substring(0, asset.final_key.lastIndexOf('/') + 1);
        
        // List all objects in the models directory
        let continuationToken: string | undefined;
        do {
          const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: dirPath,
            ContinuationToken: continuationToken,
          });
          
          const listResult = await s3.send(listCommand);
          
          if (listResult.Contents) {
            for (const obj of listResult.Contents) {
              if (obj.Key) {
                try {
                  await s3.send(new DeleteObjectCommand({
                    Bucket: bucket,
                    Key: obj.Key,
                  }));
                  deletedFiles.push(obj.Key);
                } catch (err: any) {
                  console.error(`Failed to delete ${obj.Key}:`, err);
                  errors.push(`${obj.Key}: ${err.message || 'Unknown error'}`);
                }
              }
            }
          }
          
          continuationToken = listResult.NextContinuationToken;
        } while (continuationToken);
      } else {
        // Single file (GLB, etc.)
        await s3.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: asset.final_key,
        }));
        deletedFiles.push(asset.final_key);
      }
    } catch (err: any) {
      console.error('Failed to delete final file(s):', err);
      errors.push(`Final file(s): ${err.message || 'Unknown error'}`);
    }
  }

  // Delete from Supabase (this will cascade delete processing_jobs and related records)
  const supabaseAdmin = getSupabaseAdmin(context.env);
  const { error: deleteError } = await supabaseAdmin
    .from('project_assets')
    .delete()
    .eq('id', asset_id);

  if (deleteError) {
    console.error('Failed to delete asset from Supabase:', deleteError);
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Failed to delete asset metadata: ${deleteError.message}`,
        deleted_files: deletedFiles,
        errors: errors,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    ) as unknown as CfResponse;
  }

  // Return success even if some file deletions failed (metadata is deleted)
  return new Response(
    JSON.stringify({
      ok: true,
      asset_id,
      project_id,
      deleted_files: deletedFiles,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length > 0 
        ? 'Asset deleted, but some files may not have been removed from storage'
        : 'Asset and all files deleted successfully',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};

