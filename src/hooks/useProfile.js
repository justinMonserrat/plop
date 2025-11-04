import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export function useProfile(userId) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const targetUserId = userId || user?.id;

  useEffect(() => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    fetchProfile();
  }, [targetUserId]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      }

      if (data) {
        setProfile(data);
      } else {
        // Create profile if it doesn't exist
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: targetUserId,
            nickname: user?.email?.split('@')[0] || 'User',
            avatar_url: null,
            bio: null,
          })
          .select()
          .single();

        if (!createError && newProfile) {
          setProfile(newProfile);
        }
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates) => {
    try {
      // First ensure profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      let result;
      if (existingProfile && !checkError) {
        // Update existing profile
        const updateData = {
          ...updates,
          updated_at: new Date().toISOString(),
        };
        
        result = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', targetUserId)
          .select()
          .single();
      } else {
        // Create new profile if it doesn't exist
        const insertData = {
          id: targetUserId,
          nickname: updates.nickname || user?.email?.split('@')[0] || 'User',
          avatar_url: updates.avatar_url || null,
          bio: updates.bio || null,
          ...updates,
        };
        
        result = await supabase
          .from('profiles')
          .insert(insertData)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Supabase update error:', result.error);
        throw result.error;
      }
      
      if (result.data) {
        setProfile(result.data);
        return { data: result.data, error: null };
      }
      
      return { data: null, error: new Error('No data returned from update') };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { data: null, error };
    }
  };

  return { profile, loading, updateProfile, fetchProfile };
}

