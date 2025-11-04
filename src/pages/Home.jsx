import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useFollows } from "../hooks/useFollows";
import { supabase } from "../supabaseClient";
import "../styles/home.css";

export default function Home({ onViewProfile }) {
  const { user } = useAuth();
  const { following } = useFollows(user?.id);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchPosts();
    }
  }, [user?.id, following]);

  const fetchPosts = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Get posts from users we're following, plus our own posts
      const followingIds = following.map(f => f.id);
      const userIds = [...followingIds, user.id];

      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .in('user_id', userIds)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching posts:', error);
        throw error;
      }

      // Fetch profile data separately
      if (postsData && postsData.length > 0) {
        const userIdsFromPosts = [...new Set(postsData.map(p => p.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', userIdsFromPosts);

        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        const postsWithProfiles = postsData.map(post => ({
          ...post,
          profiles: profilesMap.get(post.user_id),
        }));

        setPosts(postsWithProfiles);
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
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
    return (
      <div className="page-content">
        <p>Loading feed...</p>
      </div>
    );
  }

  return (
    <div className="page-content">
      <h1>Home Feed</h1>
      
      {posts.length === 0 ? (
        <div className="empty-feed">
          <p>No posts yet! Start following people or create your first post on the Blog page.</p>
        </div>
      ) : (
        <div className="posts-feed">
          {posts.map((post) => (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <div 
                  className="post-author"
                  onClick={() => onViewProfile && onViewProfile(post.user_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="post-avatar">
                    {post.profiles?.avatar_url ? (
                      <img src={post.profiles.avatar_url} alt={post.profiles.nickname} />
                    ) : (
                      <div className="post-avatar-placeholder">
                        {post.profiles?.nickname?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="post-author-info">
                    <span className="post-author-name">
                      {post.profiles?.nickname || 'User'}
                    </span>
                    <span className="post-time">{formatDate(post.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="post-content">
                {post.image_url && (
                  <img src={post.image_url} alt="Post" className="post-image" />
                )}
                {post.content && <p>{post.content}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
