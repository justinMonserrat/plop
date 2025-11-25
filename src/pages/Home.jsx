import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { supabase } from "../supabaseClient";
import { compressPostImage } from "../utils/imageCompression";
import "../styles/home.css";
import "../styles/blog.css";
import { notifyUser } from "../utils/notifications";

const POSTS_PER_PAGE = 20;

export default function Home({ onViewProfile }) {
  const { user } = useAuth();
  const { profile: selfProfile } = useProfile(user?.id);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [commentInputs, setCommentInputs] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [commentImages, setCommentImages] = useState({});
  const [commentImagePreviews, setCommentImagePreviews] = useState({});
  const [uploadingCommentImage, setUploadingCommentImage] = useState(false);
  const commentFileInputRefs = useRef({});

  useEffect(() => {
    setPosts([]);
    setPage(0);
    setHasMore(true);
    fetchPosts(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const channel = supabase.channel('home-feed-updates');

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'posts' },
      () => {
        setPage(0);
        setHasMore(true);
        fetchPosts(0, true);
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPosts = async (pageNum = 0, reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
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

      // Show posts immediately with basic data (progressive loading)
      const userIdsFromPosts = [...new Set(postsData.map(p => p.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', userIdsFromPosts);

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

      // Show posts with profiles first (faster initial render)
      const postsWithProfiles = postsData.map(post => ({
        ...post,
        profiles: profilesMap.get(post.user_id),
        likes: [],
        likeCount: 0,
        isLiked: false,
        comments: [],
        commentCount: 0,
      }));

      if (reset) {
        setPosts(postsWithProfiles);
        setLoading(false); // Show posts immediately
      } else {
        setPosts(prev => [...prev, ...postsWithProfiles]);
        setLoadingMore(false);
      }

      // Then fetch likes and comments in parallel (non-blocking)
      const postIds = postsData.map(p => p.id);

      const [likesResult, commentsResult] = await Promise.all([
        supabase
          .from('post_likes')
          .select('*')
          .in('post_id', postIds),
        supabase
          .from('comments')
          .select('*')
          .in('post_id', postIds)
          .order('created_at', { ascending: true })
      ]);

      const likesData = likesResult.data || [];
      const commentsData = commentsResult.data || [];

      // Get commenter profiles
      const commenterIds = [...new Set(commentsData.map(c => c.user_id))];
      const { data: commenterProfiles } = commenterIds.length > 0
        ? await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', commenterIds)
        : { data: [] };

      const commenterProfilesMap = new Map((commenterProfiles || []).map(p => [p.id, p]));

      // Update posts with likes and comments
      setPosts(prev => prev.map(post => {
        const postIndex = postsData.findIndex(p => p.id === post.id);
        if (postIndex === -1) return post; // Keep existing posts that weren't just fetched

        const likes = likesData.filter(l => l.post_id === post.id);
        const isLiked = user?.id ? likes.some(l => l.user_id === user.id) : false;
        const comments = commentsData.filter(c => c.post_id === post.id && !c.parent_id);
        const allComments = commentsData.filter(c => c.post_id === post.id);

        // Build comment tree
        const commentsWithReplies = comments.map(comment => {
          const replies = allComments.filter(c => c.parent_id === comment.id);
          return {
            ...comment,
            author: commenterProfilesMap.get(comment.user_id),
            replies: replies.map(reply => ({
              ...reply,
              author: commenterProfilesMap.get(reply.user_id),
            })),
          };
        });

        return {
          ...post,
          likes,
          likeCount: likes.length,
          isLiked,
          comments: commentsWithReplies,
          commentCount: allComments.length,
        };
      }));
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

  const handleLike = async (postId, isLiked) => {
    if (!user?.id) return;

    const targetPost = posts.find((post) => post.id === postId);

    try {
      if (isLiked) {
        // Unlike
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Like
        const { error } = await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });

        if (error) throw error;

        if (targetPost && targetPost.user_id && targetPost.user_id !== user.id) {
          const actorName = selfProfile?.nickname || user?.email?.split('@')[0] || 'Someone';
          await notifyUser({
            recipientId: targetPost.user_id,
            actorId: user.id,
            type: "post_like",
            postId,
            payload: {
              actorName,
              postId,
              snippet: targetPost.content?.slice(0, 80) || "",
            },
          });
        }
      }

      // Update local state
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          const newIsLiked = !isLiked;
          const newLikes = newIsLiked
            ? [...post.likes, { post_id: postId, user_id: user.id }]
            : post.likes.filter(l => l.user_id !== user.id);
          return {
            ...post,
            likes: newLikes,
            likeCount: newLikes.length,
            isLiked: newIsLiked,
          };
        }
        return post;
      }));
    } catch (error) {
      console.error('Error toggling like:', error);
      alert('Error updating like. Please try again.');
    }
  };

  const handleCommentImageSelect = async (e, postId, commentId = null) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      const key = commentId ? `${postId}-${commentId}` : postId;
      if (commentFileInputRefs.current[key]) {
        commentFileInputRefs.current[key].value = '';
      }
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB.');
      const key = commentId ? `${postId}-${commentId}` : postId;
      if (commentFileInputRefs.current[key]) {
        commentFileInputRefs.current[key].value = '';
      }
      return;
    }

    try {
      const compressedFile = await compressPostImage(file);

      if (compressedFile.size > 2 * 1024 * 1024) {
        alert('Image is too large even after compression. Please try a smaller image.');
        const key = commentId ? `${postId}-${commentId}` : postId;
        if (commentFileInputRefs.current[key]) {
          commentFileInputRefs.current[key].value = '';
        }
        return;
      }

      const key = commentId ? `${postId}-${commentId}` : postId;
      setCommentImages(prev => ({ ...prev, [key]: compressedFile }));
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setCommentImagePreviews(prev => ({ ...prev, [key]: reader.result }));
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Error compressing image:', error);
      alert('Error processing image. Please try again.');
      const key = commentId ? `${postId}-${commentId}` : postId;
      if (commentFileInputRefs.current[key]) {
        commentFileInputRefs.current[key].value = '';
      }
    }
  };

  const handleComment = async (postId, content, parentId = null) => {
    const key = parentId ? `${postId}-${parentId}` : postId;
    const commentImage = commentImages[key];
    const commentText = content.trim();
    
    if (!user?.id || (!commentText && !commentImage)) return;

    setUploadingCommentImage(true);
    try {
      let imageUrl = null;

      // Upload image if present
      if (commentImage) {
        try {
          const fileName = `${user.id}-${Date.now()}-comment.jpg`;

          const { error: uploadError } = await supabase.storage
            .from('post-images')
            .upload(fileName, commentImage, {
              upsert: true,
              cacheControl: '3600',
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            alert(`Error uploading image: ${uploadError.message || 'Please try again.'}`);
            setUploadingCommentImage(false);
            return;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('post-images')
            .getPublicUrl(fileName);

          imageUrl = publicUrl;
        } catch (error) {
          console.error('Error uploading comment image:', error);
          alert('Error uploading image. Please try again.');
          setUploadingCommentImage(false);
          return;
        }
      }

      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: commentText || null,
          image_url: imageUrl || null,
          parent_id: parentId,
        })
        .select()
        .single();

      if (error) throw error;

      // Fetch commenter profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .eq('id', user.id)
        .single();

      const newComment = {
        ...data,
        author: profile,
        replies: [],
      };

      // Update local state
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          if (parentId) {
            // Reply to comment
            const updatedComments = post.comments.map(comment => {
              if (comment.id === parentId) {
                return {
                  ...comment,
                  replies: [...comment.replies, newComment],
                };
              }
              return comment;
            });
            return {
              ...post,
              comments: updatedComments,
              commentCount: post.commentCount + 1,
            };
          } else {
            // New top-level comment
            return {
              ...post,
              comments: [...post.comments, newComment],
              commentCount: post.commentCount + 1,
            };
          }
        }
        return post;
      }));

      const actorName = selfProfile?.nickname || user?.email?.split('@')[0] || 'Someone';
      const targetPost = posts.find((post) => post.id === postId);
      if (!parentId) {
        if (targetPost?.user_id && targetPost.user_id !== user.id) {
          await notifyUser({
            recipientId: targetPost.user_id,
            actorId: user.id,
            type: "post_comment",
            postId,
            payload: {
              actorName,
              postId,
              snippet: commentText ? commentText.slice(0, 80) : '[Image]',
            },
          });
        }
      } else {
        const postForReply = posts.find((post) => post.id === postId);
        const parentComment = postForReply?.comments?.find((comment) => comment.id === parentId);
        if (parentComment?.user_id && parentComment.user_id !== user.id) {
          await notifyUser({
            recipientId: parentComment.user_id,
            actorId: user.id,
            type: "comment_reply",
            postId,
            commentId: parentId,
              payload: {
                actorName,
                postId,
                commentId: parentId,
                snippet: commentText ? commentText.slice(0, 80) : '[Image]',
              },
          });
        }
      }

      // Clear inputs
      if (parentId) {
        setReplyInputs(prev => ({ ...prev, [parentId]: '' }));
        setCommentImages(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
        setCommentImagePreviews(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
        if (commentFileInputRefs.current[key]) {
          commentFileInputRefs.current[key].value = '';
        }
      } else {
        setCommentInputs(prev => ({ ...prev, [postId]: '' }));
        setCommentImages(prev => {
          const newState = { ...prev };
          delete newState[postId];
          return newState;
        });
        setCommentImagePreviews(prev => {
          const newState = { ...prev };
          delete newState[postId];
          return newState;
        });
        if (commentFileInputRefs.current[postId]) {
          commentFileInputRefs.current[postId].value = '';
        }
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Error adding comment. Please try again.');
    } finally {
      setUploadingCommentImage(false);
    }
  };

  const toggleComments = (postId) => {
    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
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

  // Show skeletons while loading following or posts
  if (loading) {
    return (
      <div className="page-content">
        <h1>Home Feed</h1>
        <div className="posts-feed">
          {[1, 2, 3].map(i => (
            <div key={i} className="post-card" style={{ opacity: 0.6 }}>
              <div className="post-header">
                <div className="post-author">
                  <div className="post-avatar">
                    <div className="post-avatar-placeholder">...</div>
                  </div>
                  <div className="post-author-info">
                    <span className="post-author-name" style={{ backgroundColor: 'var(--bg-secondary)', width: '100px', height: '16px', display: 'block', borderRadius: '4px' }}></span>
                    <span className="post-time" style={{ backgroundColor: 'var(--bg-secondary)', width: '60px', height: '12px', display: 'block', borderRadius: '4px', marginTop: '4px' }}></span>
                  </div>
                </div>
              </div>
              <div className="post-content" style={{ backgroundColor: 'var(--bg-secondary)', height: '60px', borderRadius: '4px', marginTop: '1rem' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <h1>Home Feed</h1>

      {posts.length === 0 && !loading ? (
        <div className="empty-feed">
          <p>No posts yet! Be the first to share something on the Blog page.</p>
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

                <div className="post-actions">
                  <button
                    className={`like-btn ${post.isLiked ? 'liked' : ''}`}
                    onClick={() => handleLike(post.id, post.isLiked)}
                  >
                    {post.isLiked ? '❤️' : '🤍'} {post.likeCount || 0}
                  </button>
                  <button
                    className="comment-btn"
                    onClick={() => toggleComments(post.id)}
                  >
                    💬 {post.commentCount || 0}
                  </button>
                </div>

                {expandedComments.has(post.id) && (
                  <div className="comments-section">
                    <div className="comments-list">
                      {post.comments?.length > 0 ? (
                        post.comments.map(comment => (
                          <div key={comment.id} className="comment-item">
                            <div className="comment-header">
                              <div
                                className="comment-author"
                                onClick={() => onViewProfile && onViewProfile(comment.user_id)}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className="comment-avatar">
                                  {comment.author?.avatar_url ? (
                                    <img src={comment.author.avatar_url} alt={comment.author.nickname} />
                                  ) : (
                                    <div className="comment-avatar-placeholder">
                                      {comment.author?.nickname?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                  )}
                                </div>
                                <span className="comment-author-name">
                                  {comment.author?.nickname || 'User'}
                                </span>
                              </div>
                              <span className="comment-time">{formatDate(comment.created_at)}</span>
                            </div>
                            <div className="comment-content">
                              {comment.image_url && (
                                <img src={comment.image_url} alt="Comment" className="post-image" style={{ maxHeight: '300px', marginBottom: '0.5rem' }} />
                              )}
                              {comment.content && <div>{comment.content}</div>}
                            </div>

                            {/* Replies */}
                            {comment.replies?.length > 0 && (
                              <div className="replies-list">
                                {comment.replies.map(reply => (
                                  <div key={reply.id} className="reply-item">
                                    <div className="reply-header">
                                      <div
                                        className="reply-author"
                                        onClick={() => onViewProfile && onViewProfile(reply.user_id)}
                                        style={{ cursor: 'pointer' }}
                                      >
                                        <div className="reply-avatar">
                                          {reply.author?.avatar_url ? (
                                            <img src={reply.author.avatar_url} alt={reply.author.nickname} />
                                          ) : (
                                            <div className="reply-avatar-placeholder">
                                              {reply.author?.nickname?.[0]?.toUpperCase() || 'U'}
                                            </div>
                                          )}
                                        </div>
                                        <span className="reply-author-name">
                                          {reply.author?.nickname || 'User'}
                                        </span>
                                      </div>
                                      <span className="reply-time">{formatDate(reply.created_at)}</span>
                                    </div>
                                    <div className="reply-content">
                                      {reply.image_url && (
                                        <img src={reply.image_url} alt="Reply" className="post-image" style={{ maxHeight: '250px', marginBottom: '0.5rem' }} />
                                      )}
                                      {reply.content && <div>{reply.content}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Reply input */}
                            <div className="reply-input-wrapper">
                              {commentImagePreviews[`${post.id}-${comment.id}`] && (
                                <div className="image-preview" style={{ marginBottom: '0.5rem' }}>
                                  <img src={commentImagePreviews[`${post.id}-${comment.id}`]} alt="Preview" style={{ maxHeight: '150px', borderRadius: '8px', border: '2px solid var(--border-color, #3b82f6)' }} />
                                  <button
                                    type="button"
                                    className="remove-image-btn"
                                    onClick={() => {
                                      const key = `${post.id}-${comment.id}`;
                                      setCommentImages(prev => {
                                        const newState = { ...prev };
                                        delete newState[key];
                                        return newState;
                                      });
                                      setCommentImagePreviews(prev => {
                                        const newState = { ...prev };
                                        delete newState[key];
                                        return newState;
                                      });
                                      if (commentFileInputRefs.current[key]) {
                                        commentFileInputRefs.current[key].value = '';
                                      }
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              )}
                              <div>
                                <input
                                  type="file"
                                  ref={el => {
                                    const key = `${post.id}-${comment.id}`;
                                    if (el) commentFileInputRefs.current[key] = el;
                                  }}
                                  onChange={(e) => handleCommentImageSelect(e, post.id, comment.id)}
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  disabled={uploadingCommentImage}
                                />
                                <div>
                                  <button
                                    type="button"
                                    className="image-btn"
                                    style={{ 
                                      padding: '6px 12px', 
                                      fontSize: '0.9rem',
                                      marginBottom: '0.5rem'
                                    }}
                                    onClick={() => {
                                      const key = `${post.id}-${comment.id}`;
                                      commentFileInputRefs.current[key]?.click();
                                    }}
                                    disabled={uploadingCommentImage}
                                    title="Add image"
                                  >
                                    📷 Add Image
                                  </button>
                                  <input
                                    type="text"
                                    placeholder="Reply..."
                                    value={replyInputs[comment.id] || ''}
                                    onChange={(e) => setReplyInputs(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                    onKeyPress={(e) => {
                                      const key = `${post.id}-${comment.id}`;
                                      const hasImage = commentImages[key];
                                      const hasText = e.target.value.trim();
                                      if (e.key === 'Enter' && (hasText || hasImage)) {
                                        handleComment(post.id, e.target.value, comment.id);
                                      }
                                    }}
                                    className="reply-input"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="no-comments">No comments yet</div>
                      )}
                    </div>

                    {/* Comment input */}
                    <div className="comment-input-wrapper">
                      {commentImagePreviews[post.id] && (
                        <div className="image-preview" style={{ marginBottom: '0.5rem' }}>
                          <img src={commentImagePreviews[post.id]} alt="Preview" style={{ maxHeight: '150px', borderRadius: '8px', border: '2px solid var(--border-color, #3b82f6)' }} />
                          <button
                            type="button"
                            className="remove-image-btn"
                            onClick={() => {
                              setCommentImages(prev => {
                                const newState = { ...prev };
                                delete newState[post.id];
                                return newState;
                              });
                              setCommentImagePreviews(prev => {
                                const newState = { ...prev };
                                delete newState[post.id];
                                return newState;
                              });
                              if (commentFileInputRefs.current[post.id]) {
                                commentFileInputRefs.current[post.id].value = '';
                              }
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <div>
                        <input
                          type="file"
                          ref={el => {
                            if (el) commentFileInputRefs.current[post.id] = el;
                          }}
                          onChange={(e) => handleCommentImageSelect(e, post.id)}
                          accept="image/*"
                          style={{ display: 'none' }}
                          disabled={uploadingCommentImage}
                        />
                        <div>
                          <button
                            type="button"
                            className="image-btn"
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '0.9rem',
                              marginBottom: '0.5rem'
                            }}
                            onClick={() => commentFileInputRefs.current[post.id]?.click()}
                            disabled={uploadingCommentImage}
                            title="Add image"
                          >
                            📷 Add Image
                          </button>
                          <input
                            type="text"
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                            onKeyPress={(e) => {
                              const hasImage = commentImages[post.id];
                              const hasText = e.target.value.trim();
                              if (e.key === 'Enter' && (hasText || hasImage)) {
                                handleComment(post.id, e.target.value);
                              }
                            }}
                            className="comment-input"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
