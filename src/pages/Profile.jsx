import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { useFollows } from "../hooks/useFollows";
import { supabase } from "../supabaseClient";
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
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || "");
      setBio(profile.bio || "");
    }
  }, [profile]);

  // Reset editing state when viewing different profile
  useEffect(() => {
    setIsEditing(false);
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
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB.');
      return;
    }

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = fileName;

    try {
      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').pop();
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      // Upload file to Supabase storage
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
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

  if (profileLoading) {
    return (
      <div className="page-content">
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="page-content">
      {!isOwnProfile && (
        <button onClick={onBackToOwnProfile} className="back-to-profile-btn">
          ← Back to My Profile
        </button>
      )}
      <div className="profile-header">
        <div className="profile-avatar-section">
          <div className="profile-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.nickname} />
            ) : (
              <div className="profile-avatar-placeholder">
                {profile?.nickname?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
          {isOwnProfile && (
            <label className="avatar-upload-btn">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                accept="image/*"
                style={{ display: 'none' }}
                disabled={uploading}
              />
              {uploading ? 'Uploading...' : 'Change Photo'}
            </label>
          )}
        </div>
        <div className="profile-info-section">
          {isEditing ? (
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
          ) : (
            <div className="profile-display">
              <h1>{profile?.nickname || (isOwnProfile ? user?.email?.split('@')[0] : 'User') || 'User'}</h1>
              {isOwnProfile && <p className="profile-email">{user?.email}</p>}
              {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
              {isOwnProfile ? (
                <button onClick={() => setIsEditing(true)} className="edit-btn">
                  Edit Profile
                </button>
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
          )}
        </div>
      </div>

      <div className="profile-sections">
        <div className="profile-section">
          <h2>Followers ({followers.length})</h2>
          {followsLoading ? (
            <p className="empty-state">Loading...</p>
          ) : followers.length === 0 ? (
            <p className="empty-state">No followers yet</p>
          ) : (
            <div className="user-list">
              {followers.map((follower) => (
                <div 
                  key={follower.id} 
                  className="user-item clickable"
                  onClick={() => onViewProfile && onViewProfile(follower.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="user-item-avatar">
                    {follower.avatar_url ? (
                      <img src={follower.avatar_url} alt={follower.nickname} />
                    ) : (
                      <div className="avatar-placeholder-small">
                        {follower.nickname?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <span className="user-item-name">{follower.nickname || 'User'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="profile-section">
          <h2>Following ({following.length})</h2>
          {followsLoading ? (
            <p className="empty-state">Loading...</p>
          ) : following.length === 0 ? (
            <p className="empty-state">Not following anyone yet</p>
          ) : (
            <div className="user-list">
              {following.map((followed) => (
                <div 
                  key={followed.id} 
                  className="user-item clickable"
                  onClick={() => onViewProfile && onViewProfile(followed.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="user-item-avatar">
                    {followed.avatar_url ? (
                      <img src={followed.avatar_url} alt={followed.nickname} />
                    ) : (
                      <div className="avatar-placeholder-small">
                        {followed.nickname?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <span className="user-item-name">{followed.nickname || 'User'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
