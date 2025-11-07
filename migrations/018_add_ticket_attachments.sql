-- Migration: 018_add_ticket_attachments.sql
-- Description: Add attachments column to ticket_responses table for file/image attachments
-- Created: 2025-11-06

-- =============================================
-- ADD ATTACHMENTS COLUMN TO TICKET_RESPONSES
-- =============================================

-- Add attachments column as JSONB to store array of attachment objects
-- Each attachment object will have: { url: string, filename: string, type: string, size: number }
ALTER TABLE IF EXISTS public.ticket_responses 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.ticket_responses.attachments IS 'Array of attachment objects with url, filename, type, and size for file/image attachments';

-- Create index for attachments if needed (GIN index for JSONB queries)
CREATE INDEX IF NOT EXISTS idx_ticket_responses_attachments ON public.ticket_responses USING GIN (attachments);

