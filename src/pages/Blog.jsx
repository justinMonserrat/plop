import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import { compressPostImage } from "../utils/imageCompression";
import "../styles/blog.css";

export default function Blog({ onViewProfile }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [postImagePreview, setPostImagePreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user?.id) {
      fetchPosts();
    }
  }, [user?.id]);

  const fetchPosts = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching posts:', error);
        throw error;
      }

      // Fetch profile data separately
      if (postsData && postsData.length > 0) {
        const userIds = [...new Set(postsData.map(p => p.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', userIds);

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

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Check original file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      // Compress the image
      const compressedFile = await compressPostImage(file);
      
      // Check compressed size (max 2MB after compression)
      if (compressedFile.size > 2 * 1024 * 1024) {
        alert('Image is too large even after compression. Please try a smaller image.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      setPostImage(compressedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPostImagePreview(reader.result);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Error compressing image:', error);
      alert('Error processing image. Please try again.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePost = async (e) => {
    e.preventDefault();
    if ((!content.trim() && !postImage) || !user?.id) return;

    setPosting(true);
    setUploadingImage(true);
    try {
      let imageUrl = null;

      // Upload image if present
      if (postImage) {
        // Always use .jpg for compressed images
        const fileName = `${user.id}-${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(fileName, postImage, {
            upsert: true,
            cacheControl: '3600',
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          alert(`Error uploading image: ${uploadError.message || 'Please try again.'}`);
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('post-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      const { error } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: content.trim() || null,
          image_url: imageUrl,
        });

      if (error) {
        console.error('Error creating post:', error);
        alert(`Error creating post: ${error.message || 'Please try again.'}`);
        return;
      }

      setContent("");
      setPostImage(null);
      setPostImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      fetchPosts(); // Refresh posts
    } catch (error) {
      console.error('Error creating post:', error);
      alert(`Error creating post: ${error.message || 'Please try again.'}`);
    } finally {
      setPosting(false);
      setUploadingImage(false);
    }
  };

  const handleDelete = async (postId, imageUrl) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      // Delete image from storage if it exists
      if (imageUrl) {
        const fileName = imageUrl.split('/').pop();
        const { error: deleteImageError } = await supabase.storage
          .from('post-images')
          .remove([fileName]);

        if (deleteImageError) {
          console.error('Error deleting post image:', deleteImageError);
          // Don't block post deletion if image deletion fails
        }
      }

      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting post:', error);
        alert('Error deleting post. Please try again.');
        return;
      }

      fetchPosts(); // Refresh posts
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Error deleting post. Please try again.');
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

  return (
    <div className="page-content">
      <h1>Blog</h1>
      
      <div className="post-form-section">
        <form onSubmit={handlePost} className="post-form">
          <textarea
            placeholder="What's on your mind? Share your thoughts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
            rows={4}
            className="post-input"
            disabled={posting || uploadingImage}
          />
          {postImagePreview && (
            <div className="image-preview">
              <img src={postImagePreview} alt="Preview" />
              <button
                type="button"
                className="remove-image-btn"
                onClick={() => {
                  setPostImage(null);
                  setPostImagePreview(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                ×
              </button>
            </div>
          )}
          <div className="post-form-footer">
            <div className="post-form-actions">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                style={{ display: 'none' }}
                disabled={posting || uploadingImage}
              />
              <button
                type="button"
                className="image-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={posting || uploadingImage}
                title="Add image"
              >
                📷 Add Image
              </button>
              <span className="character-count">
                {content.length}/500
              </span>
            </div>
            <button 
              type="submit" 
              className="post-btn"
              disabled={(!content.trim() && !postImage) || posting || uploadingImage}
            >
              {uploadingImage ? 'Uploading...' : posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <p>Loading posts...</p>
      ) : (
        <div className="posts-feed">
          {posts.length === 0 ? (
            <div className="empty-feed">
              <p>No posts yet! Be the first to share something.</p>
            </div>
          ) : (
            posts.map((post) => (
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
                  {post.user_id === user?.id && (
                    <button
                      className="delete-post-btn"
                      onClick={() => handleDelete(post.id, post.image_url)}
                      title="Delete post"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="post-content">
                  {post.image_url && (
                    <img src={post.image_url} alt="Post" className="post-image" />
                  )}
                  {post.content && <p>{post.content}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
