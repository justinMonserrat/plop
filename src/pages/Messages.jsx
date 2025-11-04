import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useFollows } from "../hooks/useFollows";
import { supabase } from "../supabaseClient";
import { compressMessageImage } from "../utils/imageCompression";
import "../styles/messages.css";

export default function Messages({ onViewProfile }) {
  const { user } = useAuth();
  const { following } = useFollows(user?.id);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageContent, setMessageContent] = useState("");
  const [messageImage, setMessageImage] = useState(null);
  const [messageImagePreview, setMessageImagePreview] = useState(null);
  const [chatMembers, setChatMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showGroupChatModal, setShowGroupChatModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [groupChatName, setGroupChatName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [groupChatMembers, setGroupChatMembers] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (user?.id) {
      fetchConversations();
    }
  }, [user?.id]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      fetchChatMembers(selectedConversation.id);
      // Subscribe to new messages
      const channel = supabase
        .channel(`messages:${selectedConversation.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${selectedConversation.id}`,
        }, () => {
          fetchMessages(selectedConversation.id);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Get all chats user is a member of
      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .order('updated_at', { ascending: false });

      if (chatsError) {
        console.error('Error fetching chats:', chatsError);
        throw chatsError;
      }

      // Get chat members for each chat
      const chatIds = chatsData?.map(c => c.id) || [];
      if (chatIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const { data: membersData, error: membersError } = await supabase
        .from('chat_members')
        .select('*')
        .in('chat_id', chatIds);

      if (membersError) {
        console.error('Error fetching chat members:', membersError);
        throw membersError;
      }

      // Filter to only chats user is in
      const userChatIds = new Set(
        membersData?.filter(m => m.user_id === user.id).map(m => m.chat_id) || []
      );
      const userChats = chatsData?.filter(c => userChatIds.has(c.id)) || [];

      // Get last message for each chat
      const { data: lastMessagesData } = await supabase
        .from('messages')
        .select('*')
        .in('chat_id', userChats.map(c => c.id))
        .order('created_at', { ascending: false });

      // Group last messages by chat_id
      const lastMessagesMap = new Map();
      lastMessagesData?.forEach(msg => {
        if (!lastMessagesMap.has(msg.chat_id)) {
          lastMessagesMap.set(msg.chat_id, msg);
        }
      });

      // Build conversations with member info
      const conversationsWithMembers = await Promise.all(
        userChats.map(async (chat) => {
          const chatMemberIds = membersData?.filter(m => m.chat_id === chat.id).map(m => m.user_id) || [];
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, nickname, avatar_url')
            .in('id', chatMemberIds);

          const lastMessage = lastMessagesMap.get(chat.id);
          
          // For 1-on-1 chats, find the other person
          const isGroupChat = chat.name !== null;
          let displayName = chat.name || 'Chat';
          let displayAvatar = null;
          
          if (!isGroupChat && profilesData) {
            const otherPerson = profilesData.find(p => p.id !== user.id);
            if (otherPerson) {
              displayName = otherPerson.nickname || 'User';
              displayAvatar = otherPerson.avatar_url;
            }
          }

          // Count unread messages
          const unreadCount = lastMessage && lastMessage.receiver_id === user.id && !lastMessage.read_at ? 1 : 0;

          return {
            id: chat.id,
            name: displayName,
            isGroupChat,
            avatar: displayAvatar,
            members: profilesData || [],
            lastMessage,
            unreadCount,
            updatedAt: chat.updated_at,
          };
        })
      );

      // Sort by last message time
      conversationsWithMembers.sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.updatedAt;
        const bTime = b.lastMessage?.created_at || b.updatedAt;
        return new Date(bTime) - new Date(aTime);
      });

      setConversations(conversationsWithMembers);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (chatId) => {
    if (!user?.id || !chatId) return;

    try {
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      // Fetch sender profiles
      const senderIds = [...new Set(messagesData?.map(m => m.sender_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', senderIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
      const messagesWithProfiles = messagesData?.map(msg => ({
        ...msg,
        sender: profilesMap.get(msg.sender_id),
      })) || [];

      setMessages(messagesWithProfiles);

      // Mark messages as read
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('chat_id', chatId)
        .neq('sender_id', user.id)
        .is('read_at', null);

      fetchConversations(); // Refresh to update unread counts
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchChatMembers = async (chatId) => {
    if (!chatId) return;

    try {
      const { data: membersData, error } = await supabase
        .from('chat_members')
        .select('user_id')
        .eq('chat_id', chatId);

      if (error) {
        console.error('Error fetching chat members:', error);
        return;
      }

      const userIds = membersData?.map(m => m.user_id) || [];
      if (userIds.length === 0) {
        setChatMembers([]);
        return;
      }

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', userIds);

      setChatMembers(profilesData || []);
    } catch (error) {
      console.error('Error fetching chat members:', error);
    }
  };

  const handleStartDirectChat = async (friendId) => {
    if (!user?.id || !friendId) return;

    try {
      // Check if chat already exists by looking at chat_members
      // First, get all chats user is a member of
      const { data: userChatMembers } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', user.id);

      let existingChat = null;
      
      if (userChatMembers && userChatMembers.length > 0) {
        const userChatIds = userChatMembers.map(m => m.chat_id);
        
        // Get all chats that are 1-on-1 (name is null)
        const { data: existingChats } = await supabase
          .from('chats')
          .select('id, name')
          .in('id', userChatIds)
          .is('name', null);

        if (existingChats && existingChats.length > 0) {
          // Check if any of these chats also have the friend as a member
          const { data: existingMembers } = await supabase
            .from('chat_members')
            .select('chat_id, user_id')
            .in('chat_id', existingChats.map(c => c.id))
            .eq('user_id', friendId);

          // Find chat with both users (exactly 2 members)
          if (existingMembers && existingMembers.length > 0) {
            const friendChatIds = new Set(existingMembers.map(m => m.chat_id));
            
            // For each chat, check if it has exactly 2 members (user + friend)
            for (const chatId of friendChatIds) {
              const { data: allMembers } = await supabase
                .from('chat_members')
                .select('user_id')
                .eq('chat_id', chatId);
              
              if (allMembers && allMembers.length === 2) {
                const memberIds = new Set(allMembers.map(m => m.user_id));
                if (memberIds.has(user.id) && memberIds.has(friendId)) {
                  existingChat = chatId;
                  break;
                }
              }
            }
          }
        }
      }

      if (existingChat) {
        // Select existing chat
        const chat = conversations.find(c => c.id === existingChat);
        if (chat) {
          setSelectedConversation(chat);
        }
        setShowNewChatModal(false);
        return;
      }

      // Create new chat
      const { data: newChat, error: chatError } = await supabase
        .from('chats')
        .insert({
          created_by: user.id,
          name: null, // 1-on-1 chat
        })
        .select()
        .single();

      if (chatError) {
        console.error('Error creating chat:', chatError);
        alert(`Error creating chat: ${chatError.message || 'Please try again.'}`);
        return;
      }

      if (!newChat || !newChat.id) {
        console.error('Chat creation returned no data');
        alert('Error creating chat: No chat data returned.');
        return;
      }

      // Add both users as members (add creator first, then friend)
      const { error: selfMemberError } = await supabase
        .from('chat_members')
        .insert({ chat_id: newChat.id, user_id: user.id });

      if (selfMemberError) {
        console.error('Error adding self as member:', selfMemberError);
        alert(`Error adding members: ${selfMemberError.message || 'Please try again.'}`);
        return;
      }

      const { error: friendMemberError } = await supabase
        .from('chat_members')
        .insert({ chat_id: newChat.id, user_id: friendId });

      if (friendMemberError) {
        console.error('Error adding friend as member:', friendMemberError);
        alert(`Error adding members: ${friendMemberError.message || 'Please try again.'}`);
        return;
      }

      setShowNewChatModal(false);
      fetchConversations();
    } catch (error) {
      console.error('Error starting chat:', error);
      alert('Error starting chat. Please try again.');
    }
  };

  const handleCreateGroupChat = async () => {
    if (!user?.id || !groupChatName.trim() || selectedFriends.length === 0) return;

    try {
      // Create chat
      const { data: newChat, error: chatError } = await supabase
        .from('chats')
        .insert({
          created_by: user.id,
          name: groupChatName.trim(),
        })
        .select()
        .single();

      if (chatError) {
        console.error('Error creating group chat:', chatError);
        alert(`Error creating group chat: ${chatError.message || 'Please try again.'}`);
        return;
      }

      if (!newChat || !newChat.id) {
        console.error('Group chat creation returned no data');
        alert('Error creating group chat: No chat data returned.');
        return;
      }

      // Add all members one by one to avoid RLS issues
      // Add creator first
      const { error: selfMemberError } = await supabase
        .from('chat_members')
        .insert({ chat_id: newChat.id, user_id: user.id });

      if (selfMemberError) {
        console.error('Error adding self as member:', selfMemberError);
        alert(`Error adding members: ${selfMemberError.message || 'Please try again.'}`);
        return;
      }

      // Add friends one by one
      for (const friendId of selectedFriends) {
        const { error: friendMemberError } = await supabase
          .from('chat_members')
          .insert({ chat_id: newChat.id, user_id: friendId });

        if (friendMemberError) {
          console.error('Error adding friend as member:', friendMemberError);
          alert(`Error adding member: ${friendMemberError.message || 'Please try again.'}`);
          return;
        }
      }

      setGroupChatName("");
      setSelectedFriends([]);
      setShowGroupChatModal(false);
      fetchConversations();
    } catch (error) {
      console.error('Error creating group chat:', error);
      alert('Error creating group chat. Please try again.');
    }
  };

  const handleAddMember = async (friendId) => {
    if (!selectedConversation || !friendId) return;

    try {
      const { error } = await supabase
        .from('chat_members')
        .insert({
          chat_id: selectedConversation.id,
          user_id: friendId,
        });

      if (error) {
        console.error('Error adding member:', error);
        alert('Error adding member. Please try again.');
        return;
      }

      setShowAddMemberModal(false);
      fetchChatMembers(selectedConversation.id);
      fetchConversations();
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Error adding member. Please try again.');
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedConversation || !user?.id) return;

    if (!confirm('Are you sure you want to leave this group chat?')) return;

    try {
      const { error } = await supabase
        .from('chat_members')
        .delete()
        .eq('chat_id', selectedConversation.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error leaving group:', error);
        alert('Error leaving group. Please try again.');
        return;
      }

      setSelectedConversation(null);
      fetchConversations();
    } catch (error) {
      console.error('Error leaving group:', error);
      alert('Error leaving group. Please try again.');
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
      const compressedFile = await compressMessageImage(file);
      
      // Check compressed size (max 1MB after compression)
      if (compressedFile.size > 1 * 1024 * 1024) {
        alert('Image is too large even after compression. Please try a smaller image.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      setMessageImage(compressedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMessageImagePreview(reader.result);
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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!messageContent.trim() && !messageImage) || !selectedConversation || !user?.id) return;

    setSending(true);
    setUploadingImage(true);
    try {
      let imageUrl = null;

      // Upload image if present
      if (messageImage) {
        // Always use .jpg for compressed images
        const fileName = `${user.id}-${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('message-images')
          .upload(fileName, messageImage, {
            upsert: true,
            cacheControl: '3600',
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('message-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Send message
      const { error } = await supabase
        .from('messages')
        .insert({
          chat_id: selectedConversation.id,
          sender_id: user.id,
          content: messageContent.trim() || null,
          image_url: imageUrl,
        });

      if (error) {
        console.error('Error sending message:', error);
        alert('Error sending message. Please try again.');
        return;
      }

      // Update chat updated_at
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selectedConversation.id);

      setMessageContent("");
      setMessageImage(null);
      setMessageImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      fetchMessages(selectedConversation.id);
      fetchConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error sending message. Please try again.');
    } finally {
      setSending(false);
      setUploadingImage(false);
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

  // Get friends without existing chats
  const availableFriends = following.filter(friend => {
    if (!selectedConversation) return true;
    return !chatMembers.some(m => m.id === friend.id);
  });

  if (loading) {
    return (
      <div className="page-content">
        <p>Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="page-content messages-container">
      <div className="conversations-sidebar">
        <div className="conversations-header">
          <h2>Messages</h2>
          <div className="new-chat-buttons">
            <button
              className="new-chat-btn"
              onClick={() => setShowNewChatModal(true)}
              title="New 1-on-1 chat"
            >
              + 1-on-1
            </button>
            <button
              className="new-group-btn"
              onClick={() => setShowGroupChatModal(true)}
              title="New group chat"
            >
              + Group
            </button>
          </div>
        </div>
        {conversations.length === 0 ? (
          <p className="empty-state">No conversations yet. Start a new conversation!</p>
        ) : (
          <div className="conversations-list">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${selectedConversation?.id === conv.id ? 'active' : ''}`}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="conversation-avatar">
                  {conv.avatar ? (
                    <img src={conv.avatar} alt={conv.name} />
                  ) : (
                    <div className="conversation-avatar-placeholder">
                      {conv.isGroupChat ? '👥' : (conv.name?.[0]?.toUpperCase() || 'U')}
                    </div>
                  )}
                </div>
                <div className="conversation-info">
                  <div className="conversation-header">
                    <span className="conversation-name">{conv.name}</span>
                    {conv.unreadCount > 0 && (
                      <span className="unread-badge">{conv.unreadCount}</span>
                    )}
                  </div>
                  <p className="conversation-preview">
                    {conv.lastMessage?.content?.substring(0, 50) || '📷 Image'}
                    {conv.lastMessage?.content && conv.lastMessage.content.length > 50 ? '...' : ''}
                  </p>
                  <span className="conversation-time">
                    {formatDate(conv.lastMessage?.created_at || conv.updatedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="messages-main">
        {selectedConversation ? (
          <>
            <div className="messages-header">
              <div className="messages-partner-info">
                <div 
                  className="messages-partner"
                  onClick={() => {
                    if (!selectedConversation.isGroupChat) {
                      const otherMember = chatMembers.find(m => m.id !== user.id);
                      if (otherMember) {
                        onViewProfile && onViewProfile(otherMember.id);
                      }
                    }
                  }}
                  style={{ cursor: selectedConversation.isGroupChat ? 'default' : 'pointer' }}
                >
                  <div className="messages-partner-avatar">
                    {selectedConversation.avatar ? (
                      <img src={selectedConversation.avatar} alt={selectedConversation.name} />
                    ) : (
                      <div className="messages-partner-avatar-placeholder">
                        {selectedConversation.isGroupChat ? '👥' : (selectedConversation.name?.[0]?.toUpperCase() || 'U')}
                      </div>
                    )}
                  </div>
                  <div>
                    <span>{selectedConversation.name}</span>
                    {selectedConversation.isGroupChat && (
                      <span className="member-count">({chatMembers.length} members)</span>
                    )}
                  </div>
                </div>
                {selectedConversation.isGroupChat && (
                  <div className="group-chat-actions">
                    <button
                      className="add-member-btn"
                      onClick={() => setShowAddMemberModal(true)}
                      title="Add member"
                    >
                      + Add
                    </button>
                    <button
                      className="leave-group-btn"
                      onClick={handleLeaveGroup}
                      title="Leave group"
                    >
                      Leave
                    </button>
                  </div>
                )}
              </div>
            </div>

            {selectedConversation.isGroupChat && (
              <div className="group-members-list">
                <strong>Members:</strong>
                <div className="members-grid">
                  {chatMembers.map((member) => (
                    <div
                      key={member.id}
                      className="member-item"
                      onClick={() => onViewProfile && onViewProfile(member.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="member-avatar">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt={member.nickname} />
                        ) : (
                          <div className="member-avatar-placeholder">
                            {member.nickname?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <span>{member.nickname || 'User'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="messages-list">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message-item ${message.sender_id === user.id ? 'sent' : 'received'}`}
                >
                  <div className="message-bubble">
                    {selectedConversation.isGroupChat && message.sender_id !== user.id && (
                      <span className="message-sender-name">{message.sender?.nickname || 'User'}</span>
                    )}
                    {message.image_url && (
                      <img src={message.image_url} alt="Message" className="message-image" />
                    )}
                    {message.content && <p className="message-content-text">{message.content}</p>}
                    <span className="message-time">{formatDate(message.created_at)}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="message-form">
              <div className="message-input-wrapper">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  className="message-input"
                  disabled={sending || uploadingImage}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={sending || uploadingImage}
                />
                <button
                  type="button"
                  className="image-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || uploadingImage}
                  title="Add image"
                >
                  📷
                </button>
              </div>
              {messageImagePreview && (
                <div className="image-preview-container">
                  <img src={messageImagePreview} alt="Preview" className="image-preview" />
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => {
                      setMessageImage(null);
                      setMessageImagePreview(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              <button
                type="submit"
                className="send-btn"
                disabled={(!messageContent.trim() && !messageImage) || sending || uploadingImage}
              >
                {uploadingImage ? 'Uploading...' : sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </>
        ) : (
          <div className="no-conversation">
            <p>Select a conversation or start a new one</p>
          </div>
        )}
      </div>

      {/* New 1-on-1 Chat Modal */}
      {showNewChatModal && (
        <div className="modal-overlay" onClick={() => setShowNewChatModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Start a Conversation</h3>
            <div className="friends-list-modal">
              {following.length === 0 ? (
                <p>No friends yet. Follow someone to start chatting!</p>
              ) : (
                following.map((friend) => (
                  <div
                    key={friend.id}
                    className="friend-item-modal"
                    onClick={() => handleStartDirectChat(friend.id)}
                  >
                    <div className="friend-avatar-modal">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt={friend.nickname} />
                      ) : (
                        <div className="friend-avatar-placeholder-modal">
                          {friend.nickname?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    <span>{friend.nickname || 'User'}</span>
                  </div>
                ))
              )}
            </div>
            <button className="close-modal-btn" onClick={() => setShowNewChatModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* New Group Chat Modal */}
      {showGroupChatModal && (
        <div className="modal-overlay" onClick={() => setShowGroupChatModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Create Group Chat</h3>
            <input
              type="text"
              placeholder="Group name"
              value={groupChatName}
              onChange={(e) => setGroupChatName(e.target.value)}
              className="group-name-input"
            />
            <div className="friends-list-modal">
              <p>Select friends to add:</p>
              {following.length === 0 ? (
                <p>No friends yet. Follow someone to create a group chat!</p>
              ) : (
                following.map((friend) => (
                  <div
                    key={friend.id}
                    className={`friend-item-modal ${selectedFriends.includes(friend.id) ? 'selected' : ''}`}
                    onClick={() => {
                      if (selectedFriends.includes(friend.id)) {
                        setSelectedFriends(selectedFriends.filter(id => id !== friend.id));
                      } else {
                        setSelectedFriends([...selectedFriends, friend.id]);
                      }
                    }}
                  >
                    <div className="friend-avatar-modal">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt={friend.nickname} />
                      ) : (
                        <div className="friend-avatar-placeholder-modal">
                          {friend.nickname?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    <span>{friend.nickname || 'User'}</span>
                    {selectedFriends.includes(friend.id) && <span>✓</span>}
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button
                className="create-group-btn"
                onClick={handleCreateGroupChat}
                disabled={!groupChatName.trim() || selectedFriends.length === 0}
              >
                Create Group
              </button>
              <button className="close-modal-btn" onClick={() => setShowGroupChatModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="modal-overlay" onClick={() => setShowAddMemberModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Member</h3>
            <div className="friends-list-modal">
              {availableFriends.length === 0 ? (
                <p>All your friends are already in this group!</p>
              ) : (
                availableFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="friend-item-modal"
                    onClick={() => handleAddMember(friend.id)}
                  >
                    <div className="friend-avatar-modal">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt={friend.nickname} />
                      ) : (
                        <div className="friend-avatar-placeholder-modal">
                          {friend.nickname?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    <span>{friend.nickname || 'User'}</span>
                  </div>
                ))
              )}
            </div>
            <button className="close-modal-btn" onClick={() => setShowAddMemberModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
