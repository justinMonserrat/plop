-- ============================================
-- PLOP DATABASE SETUP
-- Run this script in Supabase SQL Editor
-- Safe to run multiple times (idempotent)
-- ============================================

-- ============================================
-- CREATE TABLES FIRST
-- ============================================

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nickname TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follows table
CREATE TABLE IF NOT EXISTS follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);

-- Create chats table (for both 1-on-1 and group chats)
CREATE TABLE IF NOT EXISTS chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT, -- NULL for 1-on-1 chats, name for group chats
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat_members table (who is in each chat)
CREATE TABLE IF NOT EXISTS chat_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(chat_id, user_id)
);

-- Drop old messages table if it exists with wrong structure
-- (This will lose data, but ensures correct structure)
DO $$ 
BEGIN
  -- Check if messages table exists with old structure (receiver_id column)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' 
    AND column_name = 'receiver_id'
  ) THEN
    DROP TABLE IF EXISTS messages CASCADE;
  END IF;
END $$;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);

-- Create post_likes table
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- NULL for top-level comments, UUID for replies
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add chat_id column if it doesn't exist (for migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' 
    AND column_name = 'chat_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN chat_id UUID REFERENCES chats(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Remove old receiver_id column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' 
    AND column_name = 'receiver_id'
  ) THEN
    ALTER TABLE messages DROP COLUMN receiver_id;
  END IF;
END $$;

-- Add image_url column to posts if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' 
    AND column_name = 'image_url'
  ) THEN
    ALTER TABLE posts ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Update posts content column to allow NULL if it doesn't already
DO $$
BEGIN
  -- Check if content can be NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts'
    AND column_name = 'content'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE posts ALTER COLUMN content DROP NOT NULL;
  END IF;
END $$;

-- Update posts table constraint to allow content or image_url
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'posts_content_or_image_url_check'
  ) THEN
    ALTER TABLE posts DROP CONSTRAINT posts_content_or_image_url_check;
  END IF;
  
  -- Add constraint that allows either content or image_url
  ALTER TABLE posts ADD CONSTRAINT posts_content_or_image_url_check 
    CHECK (content IS NOT NULL OR image_url IS NOT NULL);
EXCEPTION
  WHEN OTHERS THEN
    -- Constraint might already exist with different name, ignore
    NULL;
END $$;

-- Add image_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' 
    AND column_name = 'image_url'
  ) THEN
    ALTER TABLE messages ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Update content column to allow NULL if it doesn't already
DO $$
BEGIN
  -- Check if content can be NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages'
    AND column_name = 'content'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
  END IF;
END $$;

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- DROP EXISTING POLICIES (if they exist)
-- ============================================

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

DROP POLICY IF EXISTS "Users can view all follows" ON follows;
DROP POLICY IF EXISTS "Users can create their own follows" ON follows;
DROP POLICY IF EXISTS "Users can delete their own follows" ON follows;

DROP POLICY IF EXISTS "Users can view all posts" ON posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON posts;

DROP POLICY IF EXISTS "Users can view chats they're in" ON chats;
DROP POLICY IF EXISTS "Users can create chats" ON chats;
DROP POLICY IF EXISTS "Users can update chats they created" ON chats;
DROP POLICY IF EXISTS "Users can delete chats they created" ON chats;

DROP POLICY IF EXISTS "Users can view chat members of their chats" ON chat_members;
DROP POLICY IF EXISTS "Chat creators can add members" ON chat_members;
DROP POLICY IF EXISTS "Users can leave chats" ON chat_members;

DROP POLICY IF EXISTS "Users can view messages in their chats" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their chats" ON messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON messages;

DROP POLICY IF EXISTS "Users can view all post likes" ON post_likes;
DROP POLICY IF EXISTS "Users can like posts" ON post_likes;
DROP POLICY IF EXISTS "Users can unlike posts" ON post_likes;

DROP POLICY IF EXISTS "Users can view all comments" ON comments;
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Post images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload post images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own post images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own post images" ON storage.objects;
DROP POLICY IF EXISTS "Message images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload message images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own message images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own message images" ON storage.objects;

-- ============================================
-- CREATE HELPER FUNCTIONS (to avoid recursion)
-- ============================================

-- Function to check if user is a chat member (bypasses RLS)
CREATE OR REPLACE FUNCTION is_chat_member(chat_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_members
    WHERE chat_id = chat_uuid
    AND user_id = user_uuid
  );
$$;

-- ============================================
-- CREATE POLICIES
-- ============================================

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Follows policies
CREATE POLICY "Users can view all follows" ON follows
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own follows" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own follows" ON follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Posts policies
CREATE POLICY "Users can view all posts" ON posts
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own posts" ON posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts" ON posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts" ON posts
  FOR DELETE USING (auth.uid() = user_id);

-- Chats policies
-- Users can view chats they created or are members of
-- Use helper function to avoid recursion
CREATE POLICY "Users can view chats they're in" ON chats
  FOR SELECT USING (
    -- Chat creator can always see their chats
    chats.created_by = auth.uid()
    OR
    -- Users can see chats if they're a member (using function to avoid recursion)
    is_chat_member(chats.id, auth.uid())
  );

CREATE POLICY "Users can create chats" ON chats
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update chats they created" ON chats
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete chats they created" ON chats
  FOR DELETE USING (auth.uid() = created_by);

-- Chat members policies
-- Users can view chat members if they're the chat creator or if they're a member of the chat
-- Use helper function to avoid recursion
CREATE POLICY "Users can view chat members of their chats" ON chat_members
  FOR SELECT USING (
    -- Chat creator can see all members
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = chat_members.chat_id
      AND chats.created_by = auth.uid()
    )
    OR
    -- Users can see members if they're a member of the chat (using function to avoid recursion)
    is_chat_member(chat_members.chat_id, auth.uid())
    OR
    -- Users can always see their own membership record
    chat_members.user_id = auth.uid()
  );

CREATE POLICY "Chat creators can add members" ON chat_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = chat_members.chat_id
      AND chats.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can leave chats" ON chat_members
  FOR DELETE USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can view messages in their chats" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.chat_id = messages.chat_id
      AND chat_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their chats" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.chat_id = messages.chat_id
      AND chat_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own messages" ON messages
  FOR DELETE USING (auth.uid() = sender_id);

-- Post likes policies
CREATE POLICY "Users can view all post likes" ON post_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can like posts" ON post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts" ON post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "Users can view all comments" ON comments
  FOR SELECT USING (true);

CREATE POLICY "Users can create comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" ON comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON comments
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- CREATE STORAGE BUCKETS
-- ============================================

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create storage bucket for post images
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create storage bucket for message images
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-images', 'message-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Avatar images are publicly accessible
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Users can upload their own avatar (filename must start with user ID)
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Users can update their own avatar
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Users can delete their own avatar
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Post images are publicly accessible
CREATE POLICY "Post images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

-- Users can upload post images (filename must start with user ID)
CREATE POLICY "Users can upload post images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-images' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Users can update their own post images
CREATE POLICY "Users can update their own post images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'post-images' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Users can delete their own post images
CREATE POLICY "Users can delete their own post images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'post-images' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Message images are publicly accessible
CREATE POLICY "Message images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'message-images');

-- Users can upload message images (filename must start with user ID)
CREATE POLICY "Users can upload message images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'message-images' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Users can update their own message images
CREATE POLICY "Users can update their own message images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'message-images' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );

-- Users can delete their own message images
CREATE POLICY "Users can delete their own message images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'message-images' AND 
    auth.role() = 'authenticated' AND
    (name LIKE auth.uid()::text || '-%' OR name LIKE auth.uid()::text || '/%')
  );
