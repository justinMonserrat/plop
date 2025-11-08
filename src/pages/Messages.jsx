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
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [messagesPage, setMessagesPage] = useState(0);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const messagesListRef = useRef(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showGroupChatModal, setShowGroupChatModal] = useState(false);
  const [showChatOptionsModal, setShowChatOptionsModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [groupChatName, setGroupChatName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    if (user?.id) {
      fetchConversations();
    }
  }, [user?.id]);

  useEffect(() => {
    if (selectedConversation) {
      setMessages([]);
      setMessagesPage(0);
      setHasMoreMessages(true);
      fetchMessages(selectedConversation.id, 0, true);
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
          // Just fetch the latest messages when new ones arrive
          fetchLatestMessages(selectedConversation.id);
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const fetchConversations = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Fetch chats and members in parallel
      const [chatsResult, membersResult] = await Promise.all([
        supabase
          .from('chats')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase
          .from('chat_members')
          .select('*')
          .eq('user_id', user.id)
      ]);

      if (chatsResult.error) {
        console.error('Error fetching chats:', chatsResult.error);
        throw chatsResult.error;
      }

      if (membersResult.error) {
        console.error('Error fetching chat members:', membersResult.error);
        throw membersResult.error;
      }

      const chatsData = chatsResult.data || [];
      const membersData = membersResult.data || [];

      if (chatsData.length === 0 || membersData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Filter to only chats user is in
      const userChatIds = new Set(membersData.map(m => m.chat_id));
      const userChats = chatsData.filter(c => userChatIds.has(c.id));

      if (userChats.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Show conversations immediately with basic info
      const conversationsWithBasicInfo = userChats.map((chat) => {
        const isGroupChat = chat.name !== null;
        return {
          id: chat.id,
          name: chat.name || 'Chat',
          isGroupChat,
          avatar: null,
          memberIds: [],
          otherPersonId: null,
          members: [],
          lastMessage: null,
          unreadCount: 0,
          updatedAt: chat.updated_at,
        };
      });

      setConversations(conversationsWithBasicInfo);
      setLoading(false); // Show conversations immediately

      // Fetch last messages and all members in parallel
      const chatIds = userChats.map(c => c.id);
      const [lastMessagesResult, allMembersResult] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .in('chat_id', chatIds)
          .order('created_at', { ascending: false })
          .limit(100), // Limit to avoid fetching too many
        supabase
          .from('chat_members')
          .select('*')
          .in('chat_id', chatIds)
      ]);

      const lastMessagesData = lastMessagesResult.data || [];
      const allMembersData = allMembersResult.data || [];

      // Group last messages by chat_id
      const lastMessagesMap = new Map();
      lastMessagesData.forEach(msg => {
        if (!lastMessagesMap.has(msg.chat_id)) {
          lastMessagesMap.set(msg.chat_id, msg);
        }
      });

      // Build conversations with member info
      const conversationsWithMembers = userChats.map((chat) => {
        const chatMemberIds = allMembersData.filter(m => m.chat_id === chat.id).map(m => m.user_id);
        const lastMessage = lastMessagesMap.get(chat.id);
        const isGroupChat = chat.name !== null;
        const otherPersonId = !isGroupChat ? chatMemberIds.find(id => id !== user.id) : null;
        const unreadCount = lastMessage && lastMessage.sender_id !== user.id && !lastMessage.read_at ? 1 : 0;

        return {
          id: chat.id,
          name: chat.name || 'Chat',
          isGroupChat,
          avatar: null,
          memberIds: chatMemberIds,
          otherPersonId,
          members: [],
          lastMessage,
          unreadCount,
          updatedAt: chat.updated_at,
        };
      });

      // Fetch profiles for 1-on-1 chats (non-blocking update)
      const otherPersonIds = conversationsWithMembers
        .filter(c => !c.isGroupChat && c.otherPersonId)
        .map(c => c.otherPersonId);

      if (otherPersonIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', otherPersonIds);

        const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
        conversationsWithMembers.forEach(conv => {
          if (!conv.isGroupChat && conv.otherPersonId) {
            const profile = profilesMap.get(conv.otherPersonId);
            if (profile) {
              conv.name = profile.nickname || 'User';
              conv.avatar = profile.avatar_url;
            }
          }
        });
      }

      // Sort by last message time
      conversationsWithMembers.sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.updatedAt;
        const bTime = b.lastMessage?.created_at || b.updatedAt;
        return new Date(bTime) - new Date(aTime);
      });

      setConversations(conversationsWithMembers);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setLoading(false);
    }
  };

  const MESSAGES_PER_PAGE = 50;

  const fetchMessages = async (chatId, pageNum = 0, reset = false) => {
    if (!user?.id || !chatId) return;

    if (reset) {
      setMessages([]);
    } else {
      setLoadingMoreMessages(true);
    }

    try {
      // Fetch messages in reverse order (newest first) for pagination
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .range(pageNum * MESSAGES_PER_PAGE, (pageNum + 1) * MESSAGES_PER_PAGE - 1);

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      if (!messagesData || messagesData.length === 0) {
        setHasMoreMessages(false);
        if (reset) {
          setMessages([]);
        }
        return;
      }

      setHasMoreMessages(messagesData.length === MESSAGES_PER_PAGE);

      // Fetch sender profiles
      const senderIds = [...new Set(messagesData?.map(m => m.sender_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', senderIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
      const messagesWithProfiles = messagesData.map(msg => ({
        ...msg,
        sender: profilesMap.get(msg.sender_id),
      }));

      // Reverse to show oldest first (for display)
      const reversed = messagesWithProfiles.reverse();

      if (reset) {
        setMessages(reversed);
        // Scroll to bottom after loading
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 100);
      } else {
        // Prepend older messages
        setMessages(prev => [...reversed, ...prev]);
      }

      // Mark messages as read
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('chat_id', chatId)
        .neq('sender_id', user.id)
        .is('read_at', null);

      if (reset) {
        fetchConversations(); // Refresh to update unread counts
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  const fetchLatestMessages = async (chatId) => {
    if (!user?.id || !chatId) return;

    try {
      // Get the most recent message timestamp we have
      const latestMessage = messages[messages.length - 1];
      const sinceTimestamp = latestMessage?.created_at;

      const query = supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (sinceTimestamp) {
        query.gt('created_at', sinceTimestamp);
      }

      const { data: newMessages, error } = await query;

      if (error) {
        console.error('Error fetching latest messages:', error);
        return;
      }

      if (newMessages && newMessages.length > 0) {
        // Fetch sender profiles for new messages
        const senderIds = [...new Set(newMessages.map(m => m.sender_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', senderIds);

        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        const messagesWithProfiles = newMessages.map(msg => ({
          ...msg,
          sender: profilesMap.get(msg.sender_id),
        }));

        setMessages(prev => [...prev, ...messagesWithProfiles]);

        // Mark as read
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('chat_id', chatId)
          .neq('sender_id', user.id)
          .is('read_at', null);

        fetchConversations(); // Refresh to update unread counts
      }
    } catch (error) {
      console.error('Error fetching latest messages:', error);
    }
  };

  const loadMoreMessages = () => {
    if (!loadingMoreMessages && hasMoreMessages && selectedConversation) {
      const nextPage = messagesPage + 1;
      setMessagesPage(nextPage);
      const scrollPosition = messagesListRef.current?.scrollTop || 0;
      const scrollHeight = messagesListRef.current?.scrollHeight || 0;

      fetchMessages(selectedConversation.id, nextPage, false).then(() => {
        // Maintain scroll position after loading older messages
        setTimeout(() => {
          if (messagesListRef.current) {
            const newScrollHeight = messagesListRef.current.scrollHeight;
            messagesListRef.current.scrollTop = newScrollHeight - scrollHeight + scrollPosition;
          }
        }, 100);
      });
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

      // Reset and reload messages from beginning
      setMessagesPage(0);
      setHasMoreMessages(true);
      fetchMessages(selectedConversation.id, 0, true);
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

  const renderConversationsSidebar = () => (
    <div className="conversations-sidebar">
      <div className="conversations-header">
        <h2>Messages</h2>
        <button
          className="new-chat-btn"
          onClick={() => setShowChatOptionsModal(true)}
          title="New chat"
        >
          + New Chat
        </button>
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
  );

  const renderMessagesMain = (isMobileView = false) => {
    if (!selectedConversation) {
      return (
        <div className="messages-main no-conversation">
          <p>Select a conversation or start a new one</p>
        </div>
      );
    }

    const memberCount = chatMembers.length;

    return (
      <div className={`messages-main ${isMobileView ? 'mobile-active' : ''}`}>
        <div className="messages-header">
          {isMobileView && (
            <button
              type="button"
              className="back-to-chats-btn"
              onClick={() => setSelectedConversation(null)}
            >
              ← Chats
            </button>
          )}
          <div className={`messages-partner-info ${isMobileView ? 'mobile' : ''}`}>
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
              </div>
            </div>
            {selectedConversation.isGroupChat && (
              <div className={`group-chat-actions ${isMobileView ? 'mobile' : ''}`}>
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
            <strong>Members ({memberCount}):</strong>
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

        <div
          className="messages-list"
          ref={messagesListRef}
          onScroll={(e) => {
            if (e.target.scrollTop === 0 && hasMoreMessages && !loadingMoreMessages) {
              loadMoreMessages();
            }
          }}
        >
          {hasMoreMessages && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <button
                onClick={loadMoreMessages}
                disabled={loadingMoreMessages}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  backgroundColor: 'var(--accent-primary, #3b82f6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingMoreMessages ? 'not-allowed' : 'pointer',
                  opacity: loadingMoreMessages ? 0.6 : 1
                }}
              >
                {loadingMoreMessages ? 'Loading older messages...' : 'Load Older Messages'}
              </button>
            </div>
          )}
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
      </div>
    );
  };

  if (loading) {
    return (
      <div className="page-content messages-page loading">
        <div className="messages-container">
          <div className="conversations-sidebar" style={{ opacity: 0.6 }}>
            <div className="conversations-header">
              <h2>Conversations</h2>
            </div>
            <div className="conversations-list">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="conversation-item"
                  style={{ backgroundColor: 'var(--bg-secondary)', height: '60px', borderRadius: '4px', marginBottom: '0.5rem' }}
                />
              ))}
            </div>
          </div>
          <div className="messages-main" style={{ opacity: 0.6, backgroundColor: 'var(--bg-secondary)', height: '400px', borderRadius: '4px' }} />
        </div>
      </div>
    );
  }

  const showMobileConversation = isMobile && !!selectedConversation;

  return (
    <div className={`page-content messages-page ${isMobile ? 'mobile' : ''}`}>
      {isMobile ? (
        showMobileConversation ? (
          <div className="mobile-conversation-view">
            {renderMessagesMain(true)}
          </div>
        ) : (
          <div className="mobile-conversations-view">
            {renderConversationsSidebar()}
          </div>
        )
      ) : (
        <div className={`messages-container ${selectedConversation ? 'has-conversation' : ''}`}>
          {renderConversationsSidebar()}
          {renderMessagesMain()}
        </div>
      )}

      {/* Chat Options Modal (choose 1-on-1 or group) */}
      {showChatOptionsModal && (
        <div className="modal-overlay" onClick={() => setShowChatOptionsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>New Chat</h3>
            <div className="chat-options-buttons">
              <button
                className="chat-option-btn"
                onClick={() => {
                  setShowChatOptionsModal(false);
                  setShowNewChatModal(true);
                }}
              >
                💬 1-on-1 Chat
              </button>
              <button
                className="chat-option-btn"
                onClick={() => {
                  setShowChatOptionsModal(false);
                  setShowGroupChatModal(true);
                }}
              >
                👥 Group Chat
              </button>
            </div>
            <button className="close-modal-btn" onClick={() => setShowChatOptionsModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
