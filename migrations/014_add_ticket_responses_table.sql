-- Migration: 014_add_ticket_responses_table.sql
-- Description: Create ticket_responses table for multi-response ticket system
-- Created: 2025-11-06

-- =============================================
-- CREATE TICKET_RESPONSES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.ticket_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL,
    user_id UUID NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_ticket_response_ticket FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_response_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- =============================================
-- CREATE INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket_id ON public.ticket_responses(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_user_id ON public.ticket_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_created_at ON public.ticket_responses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_unread ON public.ticket_responses(ticket_id, is_read) WHERE is_read = false;

-- =============================================
-- ADD COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE public.ticket_responses IS 'Stores responses/replies to support tickets, enabling conversation threading';
COMMENT ON COLUMN public.ticket_responses.ticket_id IS 'Reference to the support ticket this response belongs to';
COMMENT ON COLUMN public.ticket_responses.user_id IS 'User who created this response (driver or customer support)';
COMMENT ON COLUMN public.ticket_responses.message IS 'Response message content';
COMMENT ON COLUMN public.ticket_responses.is_read IS 'Whether the response has been read by the recipient';
COMMENT ON COLUMN public.ticket_responses.created_at IS 'Timestamp when the response was created';

