import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export function useFollows(userId) {
  const { user } = useAuth();
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchFollows = useCallback(async () => {
    setLoading(true);
    try {
      // Get followers (people who follow this user)
      const { data: followersData, error: followersError } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userId);

      if (followersError) {
        // Only log if it's not a network error
        if (followersError.message && !followersError.message.includes('Failed to fetch') && !followersError.message.includes('ERR_NAME_NOT_RESOLVED')) {
          console.error('Error fetching followers:', followersError);
        }
      }

      if (followersData && followersData.length > 0) {
        const followerIds = followersData.map(f => f.follower_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', followerIds);

        if (profilesError) {
          console.error('Error fetching follower profiles:', profilesError);
        }

        if (profiles) {
          setFollowers(profiles);
        } else {
          setFollowers([]);
        }
      } else {
        setFollowers([]);
      }

      // Get following (people this user follows)
      const { data: followingData, error: followingError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);

      if (followingError) {
        // Only log if it's not a network error
        if (followingError.message && !followingError.message.includes('Failed to fetch') && !followingError.message.includes('ERR_NAME_NOT_RESOLVED')) {
          console.error('Error fetching following:', followingError);
        }
      }

      if (followingData && followingData.length > 0) {
        const followingIds = followingData.map(f => f.following_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', followingIds);

        if (profilesError) {
          console.error('Error fetching following profiles:', profilesError);
        }

        if (profiles) {
          setFollowing(profiles);
        } else {
          setFollowing([]);
        }
      } else {
        setFollowing([]);
      }
    } catch (err) {
      console.error('Error fetching follows:', err);
      setFollowers([]);
      setFollowing([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const checkIfFollowing = useCallback(async () => {
    if (!user?.id || userId === user.id) {
      setIsFollowing(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', user.id)
        .eq('following_id', userId)
        .single();

      setIsFollowing(!!data);
    } catch {
      setIsFollowing(false);
    }
  }, [userId, user?.id]);

  useEffect(() => {
    if (!userId || !user?.id) {
      setLoading(false);
      return;
    }

    fetchFollows();
    checkIfFollowing();
  }, [userId, user?.id, fetchFollows, checkIfFollowing]);

  const toggleFollow = async () => {
    if (!user?.id || userId === user.id) return;

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);

        if (!error) {
          setIsFollowing(false);
          fetchFollows();
        }
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: user.id,
            following_id: userId,
          });

        if (!error) {
          setIsFollowing(true);
          fetchFollows();
        }
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
    }
  };

  return { followers, following, isFollowing, loading, toggleFollow, fetchFollows };
}

