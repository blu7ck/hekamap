import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';
import { authenticateApiKey, authenticateWorker } from '../middleware/auth.js';

export const jobsRouter = Router();

// POST /api/jobs/create - Called by Cloudflare Worker after upload
jobsRouter.post('/create', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { project_id, asset_id, asset_category } = req.body;

    if (!project_id || !asset_id || !asset_category) {
      return res.status(400).json({ error: 'project_id, asset_id, asset_category required' });
    }

    if (!['single_model', 'large_area'].includes(asset_category)) {
      return res.status(400).json({ error: 'asset_category must be single_model or large_area' });
    }

    const supabase = getSupabaseClient();

    // Fetch asset to get source_format
    const { data: asset, error: assetError } = await supabase
      .from('project_assets')
      .select('id, project_id, asset_key, source_format, processing_status')
      .eq('id', asset_id)
      .single();

    if (assetError || !asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (asset.processing_status !== 'pending') {
      return res.status(400).json({ error: 'Asset already processed or queued' });
    }

    // Determine job_type based on asset_category and source_format
    let jobType: 'normalize' | 'tileset' | 'pointcloud';
    if (asset_category === 'single_model') {
      jobType = 'normalize';
    } else {
      // large_area
      if (asset.source_format === 'las' || asset.source_format === 'laz') {
        jobType = 'pointcloud';
      } else {
        jobType = 'tileset';
      }
    }

    // Check if job already exists
    const { data: existingJob } = await supabase
      .from('processing_jobs')
      .select('id')
      .eq('asset_id', asset_id)
      .eq('status', 'queued')
      .single();

    if (existingJob) {
      return res.json({
        ok: true,
        job_id: existingJob.id,
        asset_id,
        project_id,
        job_type: jobType,
        status: 'queued',
        message: 'Job already exists',
      });
    }

    // Create job (should already be created by upload-complete.ts, but handle it anyway)
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        asset_id,
        job_type: jobType,
        status: 'queued',
        raw_file_key: asset.asset_key,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('Job creation error:', jobError);
      return res.status(500).json({ error: 'Failed to create job' });
    }

    res.json({
      ok: true,
      job_id: job.id,
      asset_id,
      project_id,
      job_type: jobType,
      status: 'queued',
    });
  } catch (error: any) {
    console.error('POST /api/jobs/create error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// GET /api/jobs/poll - Called by worker containers to fetch pending jobs
jobsRouter.get('/poll', authenticateWorker, async (req: Request, res: Response) => {
  try {
    const workerId = req.headers['x-worker-id'] as string;
    const workerType = req.query.worker_type as string | undefined; // 'blender', 'entwine', '3d-tiles', 'job-dispatcher'

    const supabase = getSupabaseClient();

    // Build query based on worker type
    let query = supabase
      .from('processing_jobs')
      .select('id, asset_id, job_type, raw_file_key')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1);

    if (workerType) {
      if (workerType === 'blender') {
        query = query.in('job_type', ['normalize']);
      } else if (workerType === 'entwine') {
        query = query.in('job_type', ['pointcloud']);
      } else if (workerType === '3d-tiles') {
        query = query.in('job_type', ['tileset']);
      } else if (workerType === 'job-dispatcher') {
        // job-dispatcher can handle any job
      }
    }

    const { data: jobs, error } = await query;

    if (error) {
      console.error('Job poll error:', error);
      return res.status(500).json({ error: 'Failed to poll jobs' });
    }

    if (!jobs || jobs.length === 0) {
      return res.json({ job: null });
    }

    const job = jobs[0];

    // Update job status to 'processing' and set worker_id
    const { error: updateError } = await supabase
      .from('processing_jobs')
      .update({
        status: 'processing',
        worker_id: workerId,
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (updateError) {
      console.error('Job update error:', updateError);
      return res.status(500).json({ error: 'Failed to update job status' });
    }

    // Fetch asset details
    const { data: asset, error: assetError } = await supabase
      .from('project_assets')
      .select('id, project_id, asset_key, name, source_format, asset_category')
      .eq('id', job.asset_id)
      .single();

    if (assetError || !asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({
      job: {
        id: job.id,
        asset_id: job.asset_id,
        job_type: job.job_type,
        raw_file_key: job.raw_file_key,
        asset: {
          id: asset.id,
          project_id: asset.project_id,
          name: asset.name,
          source_format: asset.source_format,
          asset_category: asset.asset_category,
        },
      },
    });
  } catch (error: any) {
    console.error('GET /api/jobs/poll error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// POST /api/jobs/:id/update - Called by worker containers to update job status
jobsRouter.post('/:id/update', authenticateWorker, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;
    const { status, error_message, progress_percent } = req.body;
    const workerId = req.headers['x-worker-id'] as string;

    if (!status) {
      return res.status(400).json({ error: 'status required' });
    }

    const supabase = getSupabaseClient();

    // Verify job belongs to this worker
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .select('id, worker_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.worker_id !== workerId) {
      return res.status(403).json({ error: 'Job does not belong to this worker' });
    }

    // Update job
    const updateData: any = {
      status,
    };

    if (error_message) {
      updateData.error_message = error_message;
    }

    if (progress_percent !== undefined) {
      updateData.progress_percent = Math.max(0, Math.min(100, progress_percent));
    }

    const { error: updateError } = await supabase
      .from('processing_jobs')
      .update(updateData)
      .eq('id', jobId);

    if (updateError) {
      console.error('Job update error:', updateError);
      return res.status(500).json({ error: 'Failed to update job' });
    }

    res.json({ ok: true, job_id: jobId, status });
  } catch (error: any) {
    console.error('POST /api/jobs/:id/update error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// POST /api/jobs/:id/complete - Called by worker containers when job is complete
jobsRouter.post('/:id/complete', authenticateWorker, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;
    const { final_key, asset_type, file_size_bytes } = req.body;
    const workerId = req.headers['x-worker-id'] as string;

    if (!final_key || !asset_type) {
      return res.status(400).json({ error: 'final_key and asset_type required' });
    }

    const supabase = getSupabaseClient();

    // Verify job belongs to this worker
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .select('id, asset_id, worker_id, status')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.worker_id !== workerId) {
      return res.status(403).json({ error: 'Job does not belong to this worker' });
    }

    if (job.status !== 'processing') {
      return res.status(400).json({ error: 'Job is not in processing status' });
    }

    // Update job status to 'completed'
    const { error: jobUpdateError } = await supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (jobUpdateError) {
      console.error('Job completion error:', jobUpdateError);
      return res.status(500).json({ error: 'Failed to complete job' });
    }

    // Update asset with final_key and processing_status
    const { error: assetUpdateError } = await supabase
      .from('project_assets')
      .update({
        final_key,
        asset_type,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        final_file_size_bytes: typeof file_size_bytes === 'number' ? file_size_bytes : null,
      })
      .eq('id', job.asset_id);

    if (assetUpdateError) {
      console.error('Asset update error:', assetUpdateError);
      // Job is already marked as completed, so we return success but log the error
      console.warn('Job completed but asset update failed:', assetUpdateError);
    }

    res.json({
      ok: true,
      job_id: jobId,
      asset_id: job.asset_id,
      final_key,
      asset_type,
    });
  } catch (error: any) {
    console.error('POST /api/jobs/:id/complete error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});


