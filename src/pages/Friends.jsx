import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useFollows } from "../hooks/useFollows";
import { supabase } from "../supabaseClient";
import "../styles/friends.css";

function FriendsActivity({ following, onViewProfile }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (following.length > 0) {
      fetchActivity();
    } else {
      setLoading(false);
      setPosts([]);
    }
  }, [following]);

  const fetchActivity = async () => {
    if (!user?.id || following.length === 0) return;
    
    setLoading(true);
    try {
      const followingIds = following.map(f => f.id);
      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching activity:', error);
        throw error;
      }

      if (!postsData || postsData.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // Show posts immediately
      const postsWithProfiles = postsData.map(post => ({
        ...post,
        profiles: null,
      }));
      setPosts(postsWithProfiles);
      setLoading(false); // Show posts immediately

      // Load profiles in parallel (non-blocking)
      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', userIds);

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      
      // Update posts with profiles
      setPosts(prev => prev.map(post => ({
        ...post,
        profiles: profilesMap.get(post.user_id),
      })));
    } catch (error) {
      console.error('Error fetching activity:', error);
      setPosts([]);
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) {
      return 'just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return <p className="activity-count">Loading activity...</p>;
  }

  if (following.length === 0) {
    return (
      <div className="activity-placeholder">
        <p>Start following people to see their activity here!</p>
        <p className="activity-count">Following {following.length} {following.length === 1 ? 'person' : 'people'}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="activity-placeholder">
        <p>No recent activity from people you follow.</p>
        <p className="activity-count">Following {following.length} {following.length === 1 ? 'person' : 'people'}</p>
      </div>
    );
  }

  return (
    <div className="activity-feed">
      <p className="activity-count">Following {following.length} {following.length === 1 ? 'person' : 'people'}</p>
      <div className="activity-posts">
        {posts.map((post) => (
          <div key={post.id} className="activity-post">
            <div 
              className="activity-post-author"
              onClick={() => onViewProfile && onViewProfile(post.user_id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="activity-post-avatar">
                {post.profiles?.avatar_url ? (
                  <img src={post.profiles.avatar_url} alt={post.profiles.nickname} />
                ) : (
                  <div className="activity-post-avatar-placeholder">
                    {post.profiles?.nickname?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <span className="activity-post-name">{post.profiles?.nickname || 'User'}</span>
              <span className="activity-post-time">{formatDate(post.created_at)}</span>
            </div>
            <p className="activity-post-content">{post.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Friends({ onViewProfile }) {
  const { user } = useAuth();
  const { following, loading: followsLoading, fetchFollows } = useFollows(user?.id);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [followingMap, setFollowingMap] = useState({});

  useEffect(() => {
    // Build a map of who we're following for quick lookup
    const map = {};
    following.forEach(f => {
      map[f.id] = true;
    });
    setFollowingMap(map);
  }, [following]);

  const performSearch = useCallback(async (query) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Search profiles by nickname (case-insensitive)
      // Only search profiles that have a non-null nickname
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, bio')
        .not('nickname', 'is', null)
        .ilike('nickname', `%${query}%`)
        .limit(20);

      if (error) {
        console.error('Search error:', error);
        throw error;
      }

      // Filter out current user and ensure nickname exists
      const filtered = profiles?.filter(p => 
        p.id !== user?.id && 
        p.nickname && 
        p.nickname.trim().length > 0
      ) || [];
      
      // Check which ones we're following
      if (filtered.length > 0) {
        const userIds = filtered.map(p => p.id);
        const { data: followsData, error: followsError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user?.id)
          .in('following_id', userIds);

        if (followsError) {
          console.error('Error fetching follows:', followsError);
        }

        const followingIds = new Set(followsData?.map(f => f.following_id) || []);
        const resultsWithFollowStatus = filtered.map(profile => ({
          ...profile,
          isFollowing: followingIds.has(profile.id),
        }));

        setSearchResults(resultsWithFollowStatus);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [user?.id]);

  // Live search with debouncing
  useEffect(() => {
    const query = searchQuery.trim();
    
    // Clear results if query is empty
    if (!query) {
      setSearchResults([]);
      return;
    }

    // Debounce: wait 300ms after user stops typing
    const timeoutId = setTimeout(() => {
      if (user?.id) {
        performSearch(query);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, user?.id, performSearch]);

  const handleSearch = async (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    performSearch(query);
  };

  const handleToggleFollow = async (userId, currentStatus) => {
    try {
      if (currentStatus) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user?.id)
          .eq('following_id', userId);

        if (!error) {
          setSearchResults(prev => 
            prev.map(u => u.id === userId ? { ...u, isFollowing: false } : u)
          );
          setFollowingMap(prev => {
            const newMap = { ...prev };
            delete newMap[userId];
            return newMap;
          });
          // Refresh following list to update count
          if (fetchFollows) {
            fetchFollows();
          }
        }
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: user?.id,
            following_id: userId,
          });

        if (!error) {
          setSearchResults(prev => 
            prev.map(u => u.id === userId ? { ...u, isFollowing: true } : u)
          );
          setFollowingMap(prev => ({ ...prev, [userId]: true }));
          // Refresh following list to update count
          if (fetchFollows) {
            fetchFollows();
          }
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      alert('Error updating follow status. Please try again.');
    }
  };

  return (
    <div className="page-content">
      <h1>Friends</h1>
      
      <div className="friends-search-section">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search users by nickname..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="search-btn" disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="search-results">
            <h2>Search Results</h2>
            <div className="user-list">
              {searchResults.map((result) => (
                <div 
                  key={result.id} 
                  className="user-item clickable"
                  onClick={() => onViewProfile && onViewProfile(result.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="user-item-avatar">
                    {result.avatar_url ? (
                      <img src={result.avatar_url} alt={result.nickname} />
                    ) : (
                      <div className="avatar-placeholder-small">
                        {result.nickname?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="user-item-info">
                    <span className="user-item-name">{result.nickname || 'User'}</span>
                    {result.bio && (
                      <span className="user-item-bio">{result.bio}</span>
                    )}
                  </div>
                  <button
                    className={result.isFollowing ? "follow-btn following" : "follow-btn"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFollow(result.id, result.isFollowing);
                    }}
                  >
                    {result.isFollowing ? "Following" : "Follow"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchQuery && searchResults.length === 0 && !searching && (
          <p className="no-results">No users found matching "{searchQuery}"</p>
        )}
      </div>

      <div className="friends-activity-section">
        <h2>Friends Activity</h2>
        <FriendsActivity following={following} onViewProfile={onViewProfile} />
      </div>
    </div>
  );
}
