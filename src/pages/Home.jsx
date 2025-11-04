import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useFollows } from "../hooks/useFollows";
import { supabase } from "../supabaseClient";
import "../styles/home.css";

const POSTS_PER_PAGE = 20;

export default function Home({ onViewProfile }) {
  const { user } = useAuth();
  const { following } = useFollows(user?.id);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (user?.id) {
      setPosts([]);
      setPage(0);
      setHasMore(true);
      fetchPosts(0, true);
    }
  }, [user?.id, following]);

  const fetchPosts = async (pageNum = 0, reset = false) => {
    if (!user?.id) return;
    
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      // Get posts from users we're following, plus our own posts
      const followingIds = following.map(f => f.id);
      const userIds = [...followingIds, user.id];

      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .in('user_id', userIds)
        .order('created_at', { ascending: false })
        .range(pageNum * POSTS_PER_PAGE, (pageNum + 1) * POSTS_PER_PAGE - 1);

      if (error) {
        console.error('Error fetching posts:', error);
        throw error;
      }

      if (!postsData || postsData.length === 0) {
        setHasMore(false);
        if (reset) {
          setPosts([]);
        }
        return;
      }

      setHasMore(postsData.length === POSTS_PER_PAGE);

      // Fetch profile data separately
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

      if (reset) {
        setPosts(postsWithProfiles);
      } else {
        setPosts(prev => [...prev, ...postsWithProfiles]);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPosts(nextPage, false);
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
      
      {posts.length === 0 && !loading ? (
        <div className="empty-feed">
          <p>No posts yet! Start following people or create your first post on the Blog page.</p>
        </div>
      ) : (
        <>
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
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button 
                onClick={loadMore} 
                disabled={loadingMore}
                style={{
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  backgroundColor: 'var(--accent-primary, #3b82f6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  opacity: loadingMore ? 0.6 : 1
                }}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
