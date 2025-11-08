import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { useFollows } from "../hooks/useFollows";
import { supabase } from "../supabaseClient";
import { compressAvatarImage } from "../utils/imageCompression";
import "../styles/profile.css";

export default function Profile({ userId, onViewProfile, onBackToOwnProfile }) {
  const { user } = useAuth();
  const viewingUserId = userId || user?.id;
  const isOwnProfile = viewingUserId === user?.id;
  const { profile, loading: profileLoading, updateProfile, fetchProfile } = useProfile(viewingUserId);
  const { followers, following, isFollowing, toggleFollow, loading: followsLoading, fetchFollows } = useFollows(viewingUserId);
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [uploading, setUploading] = useState(false);
  const [followersModalOpen, setFollowersModalOpen] = useState(false);
  const [followingModalOpen, setFollowingModalOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);
  const [bannerStyle, setBannerStyle] = useState("nebula");
  const [updatingBanner, setUpdatingBanner] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const bannerOptions = useMemo(() => ([
    { id: "nebula", label: "Nebula", gradient: "linear-gradient(135deg, #0f1f3d 0%, #1e3a5f 100%)" },
    { id: "sunset", label: "Sunset", gradient: "linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)" },
    { id: "aurora", label: "Aurora", gradient: "linear-gradient(135deg, #43cea2 0%, #185a9d 100%)" },
    { id: "midnight", label: "Midnight", gradient: "linear-gradient(135deg, #232526 0%, #414345 100%)" },
    { id: "retro", label: "Retro", gradient: "linear-gradient(135deg, #f953c6 0%, #b91d73 100%)" },
    { id: "ocean", label: "Ocean", gradient: "linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)" }
  ]), []);

  const handleLogout = async () => {
    try {
      // Sign out from Supabase (ignore errors if session is already missing)
      const { error } = await supabase.auth.signOut();

      // If error is about missing session, we're already logged out
      if (error && !error.message.includes('session missing')) {
        console.error('Logout error:', error);
      }

      // Clear storage and redirect regardless
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    } catch (error) {
      // Even if there's an error, clear and redirect
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || "");
      setBio(profile.bio || "");
      setBannerStyle(profile.banner_style || "nebula");
    }
  }, [profile]);

  // Reset editing state when viewing different profile
  useEffect(() => {
    setIsEditing(false);
  }, [viewingUserId]);

  useEffect(() => {
    if (!viewingUserId) return;
    let isMounted = true;

    const fetchPosts = async () => {
      setPostsLoading(true);
      setPostsError(null);

      try {
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('user_id', viewingUserId)
          .order('created_at', { ascending: false });

        if (error) {
          if (error.message && !error.message.includes('Failed to fetch') && !error.message.includes('ERR_NAME_NOT_RESOLVED')) {
            console.error('Error fetching user posts:', error);
          }
          if (isMounted) {
            setPosts([]);
            setPostsError('Unable to load posts right now. Please try again later.');
          }
          return;
        }

        if (isMounted) {
          setPosts(data || []);
        }
      } catch (err) {
        console.error('Error fetching user posts:', err);
        if (isMounted) {
          setPosts([]);
          setPostsError('Unable to load posts right now. Please try again later.');
        }
      } finally {
        if (isMounted) {
          setPostsLoading(false);
        }
      }
    };

    fetchPosts();

    return () => {
      isMounted = false;
    };
  }, [viewingUserId]);

  const handleSave = async () => {
    const trimmedNickname = nickname.trim();
    const trimmedBio = bio.trim();

    // Ensure nickname is not empty
    if (!trimmedNickname) {
      alert('Nickname cannot be empty. Please enter a nickname.');
      return;
    }

    const { data, error } = await updateProfile({
      nickname: trimmedNickname,
      bio: trimmedBio || null,
    });

    if (error) {
      console.error('Error saving profile:', error);
      alert(`Error saving profile: ${error.message || 'Please try again.'}`);
    } else {
      // Update local state to reflect saved changes
      if (data) {
        setNickname(data.nickname || "");
        setBio(data.bio || "");
      }
      setIsEditing(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Check original file size (max 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setUploading(true);

    try {
      // Compress the image
      const compressedFile = await compressAvatarImage(file);

      // Check compressed size (max 500KB after compression)
      if (compressedFile.size > 500 * 1024) {
        alert('Image is too large even after compression. Please try a smaller image.');
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').pop();
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      // Always use .jpg for compressed images
      const fileName = `${user.id}-${Date.now()}.jpg`;
      const filePath = fileName;

      // Upload compressed file to Supabase storage
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedFile, {
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile
      const { error: updateError } = await updateProfile({
        avatar_url: publicUrl,
      });

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert(`Error uploading avatar: ${error.message || 'Please try again.'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBannerSelect = async (styleId) => {
    if (!isOwnProfile || styleId === bannerStyle || updatingBanner) return;

    const selected = bannerOptions.find(option => option.id === styleId);
    if (!selected) return;

    const previousStyle = bannerStyle;
    setBannerStyle(styleId);
    setUpdatingBanner(true);

    const { error } = await updateProfile({ banner_style: styleId });
    if (error) {
      console.error('Error updating banner style:', error);
      alert(`Could not update banner: ${error.message || 'Please try again.'}`);
      setBannerStyle(previousStyle);
    }

    setUpdatingBanner(false);
  };

  if (profileLoading) {
    return (
      <div className="page-content">
        <p>Loading profile...</p>
      </div>
    );
  }

  const handleBackToProfile = () => {
    if (onBackToOwnProfile) {
      onBackToOwnProfile();
    } else if (user?.id) {
      navigate('/profile');
    } else {
      navigate('/home');
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
    } else {
      return date.toLocaleDateString();
    }
  };

  const activeBanner = bannerOptions.find(option => option.id === bannerStyle) || bannerOptions[0];

  return (
    <div className="page-content profile-page">
      {!isOwnProfile && (
        <button
          onClick={handleBackToProfile}
          className="back-to-profile-btn"
        >
          ← Back to My Profile
        </button>
      )}

      <section
        className={`profile-header banner-${bannerStyle}`}
        style={{ backgroundImage: activeBanner?.gradient }}
      >
        <div className="profile-header-overlay" />
        <div className="profile-header-content">
          <div className="profile-summary">
            <div className="profile-summary-top">
              <div
                className={`profile-avatar ${isOwnProfile ? 'profile-avatar-editable' : ''}`}
                onClick={() => {
                  if (isOwnProfile) {
                    fileInputRef.current?.click();
                  }
                }}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.nickname} />
                ) : (
                  <div className="profile-avatar-placeholder">
                    {profile?.nickname?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                {isOwnProfile && uploading && (
                  <div className="profile-avatar-status">Uploading...</div>
                )}
              </div>
              {isOwnProfile && (
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarUpload}
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={uploading}
                />
              )}
              <div className="profile-summary-info">
                <h1>{profile?.nickname || (isOwnProfile ? user?.email?.split('@')[0] : 'User') || 'User'}</h1>
                <div className="profile-meta">
                  <button
                    type="button"
                    className="profile-meta-item"
                    onClick={() => setFollowersModalOpen(true)}
                  >
                    <span className="meta-count">{followers.length}</span>
                    <span className="meta-label">Followers</span>
                  </button>
                  <button
                    type="button"
                    className="profile-meta-item"
                    onClick={() => setFollowingModalOpen(true)}
                  >
                    <span className="meta-count">{following.length}</span>
                    <span className="meta-label">Following</span>
                  </button>
                </div>
                {!isEditing && (
                  <div className="profile-summary-contact">
                    {isOwnProfile && <p className="profile-email">{user?.email}</p>}
                    {profile?.bio ? (
                      <p className="profile-bio full-width">{profile.bio}</p>
                    ) : (
                      isOwnProfile && (
                        <p className="profile-bio placeholder">
                          Tell people more about yourself by adding a bio.
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            {isEditing ? (
              <>
                <div className="profile-edit-form">
                  <div className="form-group">
                    <label>Nickname</label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Enter nickname"
                      maxLength={50}
                    />
                  </div>
                  <div className="form-group">
                    <label>Bio</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell us about yourself..."
                      maxLength={500}
                      rows={4}
                    />
                  </div>
                  <div className="form-actions">
                    <button onClick={handleSave} className="save-btn">Save</button>
                    <button onClick={() => setIsEditing(false)} className="cancel-btn">Cancel</button>
                  </div>
                </div>
                <div className="banner-picker">
                  <span className="banner-picker-label">Profile Banner</span>
                  <div className="banner-options">
                    {bannerOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`banner-option ${bannerStyle === option.id ? 'active' : ''}`}
                        style={{ backgroundImage: option.gradient }}
                        onClick={() => handleBannerSelect(option.id)}
                        disabled={updatingBanner}
                        title={option.label}
                      >
                        {bannerStyle === option.id && <span className="banner-option-check">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="profile-summary-footer">
                <div className="profile-actions">
                  {isOwnProfile ? (
                    <>
                      <button onClick={() => setIsEditing(true)} className="edit-btn">
                        Edit Profile
                      </button>
                      <button onClick={handleLogout} className="logout-btn">
                        Log Out
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={async () => {
                        await toggleFollow();
                        if (fetchFollows) {
                          fetchFollows();
                        }
                      }}
                      className={isFollowing ? "follow-btn following" : "follow-btn"}
                    >
                      {isFollowing ? "Following" : "Follow"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="profile-posts-section">
        <div className="profile-posts-header">
          <h2>{isOwnProfile ? "Your Posts" : `${profile?.nickname || 'User'}'s Posts`}</h2>
        </div>
        {postsLoading ? (
          <div className="profile-posts-grid">
            {[1, 2, 3].map((skeleton) => (
              <div key={skeleton} className="profile-post-card skeleton">
                <div className="skeleton-header"></div>
                <div className="skeleton-body"></div>
              </div>
            ))}
          </div>
        ) : postsError ? (
          <div className="profile-posts-empty">
            <p>{postsError}</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="profile-posts-empty">
            <p>
              {isOwnProfile
                ? "You haven't shared any posts yet. Create your first one from the Blog page!"
                : `${profile?.nickname || 'This user'} hasn't shared any posts yet.`}
            </p>
          </div>
        ) : (
          <div className="profile-posts-grid">
            {posts.map((post) => (
              <article key={post.id} className="profile-post-card">
                <header className="profile-post-header">
                  <div className="profile-post-meta">
                    <span className="profile-post-author">
                      {profile?.nickname || 'User'}
                    </span>
                    <span className="profile-post-time">{formatDate(post.created_at)}</span>
                  </div>
                </header>
                <div className="profile-post-content">
                  {post.image_url && (
                    <img src={post.image_url} alt="Post attachment" className="profile-post-image" />
                  )}
                  {post.content && <p>{post.content}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {(followersModalOpen || followingModalOpen) && (
        <div
          className="profile-modal-overlay"
          onClick={() => {
            setFollowersModalOpen(false);
            setFollowingModalOpen(false);
          }}
        >
          <div
            className="profile-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                {followersModalOpen ? `Followers (${followers.length})` : `Following (${following.length})`}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setFollowersModalOpen(false);
                  setFollowingModalOpen(false);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-list">
              {followsLoading ? (
                <p className="empty-state">Loading...</p>
              ) : (
                (followersModalOpen ? followers : following).length === 0 ? (
                  <p className="empty-state">
                    {followersModalOpen ? 'No followers yet.' : 'Not following anyone yet.'}
                  </p>
                ) : (
                  (followersModalOpen ? followers : following).map((person) => (
                    <div
                      key={person.id}
                      className="modal-user-item"
                      onClick={() => {
                        setFollowersModalOpen(false);
                        setFollowingModalOpen(false);
                        onViewProfile && onViewProfile(person.id);
                      }}
                    >
                      <div className="modal-user-avatar">
                        {person.avatar_url ? (
                          <img src={person.avatar_url} alt={person.nickname} />
                        ) : (
                          <div className="modal-avatar-placeholder">
                            {person.nickname?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <div className="modal-user-info">
                        <span className="modal-user-name">{person.nickname || 'User'}</span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
