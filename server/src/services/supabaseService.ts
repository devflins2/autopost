import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'media';

/**
 * Fetches all media items from Supabase Storage
 */
export const fetchAllFromSupabase = async (type: 'video' | 'image' | 'all' = 'all') => {
  if (!supabaseUrl || !supabaseKey) return [];

  try {
    // List files in the 'media' bucket
    const { data, error } = await supabase.storage.from(BUCKET_NAME).list('', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });

    if (error) throw error;
    if (!data) return [];

    // Filter by type if needed and map to our standard format
    return data
      .filter(file => {
        if (type === 'video') return file.metadata?.mimetype?.startsWith('video/');
        if (type === 'image') return file.metadata?.mimetype?.startsWith('image/');
        return true;
      })
      .map(file => {
        const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(file.name);
        
        return {
          id: file.id,
          url: publicUrl,
          previewUrl: publicUrl, // Supabase doesn't auto-generate thumbs like Cloudinary without extra config
          resource_type: file.metadata?.mimetype?.startsWith('video/') ? 'video' : 'image',
          keyword: file.name.split('.')[0].split('_')[0] || 'nature'
        };
      });
  } catch (error: any) {
    console.error(`❌ Supabase Storage Error:`, error.message);
    return [];
  }
};

/**
 * Fetch one item (for compatibility with your existing logic)
 */
export const fetchOneFromSupabase = async (type: 'video' | 'image') => {
  const items = await fetchAllFromSupabase(type);
  return items.length > 0 ? items[0] : null;
};

export const fetchOneVideoFromSupabase = () => fetchOneFromSupabase('video');
export const fetchOneImageFromSupabase = () => fetchOneFromSupabase('image');

/**
 * Delete media from Supabase Storage
 */
export const deleteMediaFromSupabase = async (fileName: string) => {
  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([fileName]);
    if (error) throw error;
    return true;
  } catch (error: any) {
    console.error(`❌ Supabase Delete Error [${fileName}]:`, error.message);
    return false;
  }
};
