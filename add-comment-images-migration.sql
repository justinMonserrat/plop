-- Migration: Add image_url column to comments table
-- Run this in Supabase SQL Editor

-- Add image_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE comments ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Update the constraint to allow comments with just images (like posts)
-- First, drop the existing NOT NULL constraint on content if it exists
DO $$
BEGIN
  -- Check if there's a NOT NULL constraint on content
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'comments' 
    AND ccu.column_name = 'content'
    AND tc.constraint_type = 'CHECK'
  ) THEN
    -- We'll need to drop and recreate the constraint
    ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_content_check;
  END IF;
END $$;

-- Change content to allow NULL (since comments can now have just images)
ALTER TABLE comments ALTER COLUMN content DROP NOT NULL;

-- Add a check constraint to ensure either content or image_url is provided
ALTER TABLE comments ADD CONSTRAINT comments_content_or_image_check 
  CHECK (content IS NOT NULL OR image_url IS NOT NULL);

