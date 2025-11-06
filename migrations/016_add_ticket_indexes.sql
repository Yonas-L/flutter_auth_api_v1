-- Migration: 016_add_ticket_indexes.sql
-- Description: Add performance indexes to support_tickets table for efficient querying
-- Created: 2025-11-06

-- =============================================
-- CREATE INDEXES FOR SUPPORT_TICKETS TABLE
-- =============================================

-- Index for filtering by user (drivers viewing their own tickets)
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

-- Index for filtering by priority
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);

-- Index for filtering by assigned user
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;

-- Index for sorting by creation date (most recent first)
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

-- Composite index for common query: user's tickets by status
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON public.support_tickets(user_id, status);

-- Composite index for common query: assigned tickets by status
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_status ON public.support_tickets(assigned_to_user_id, status) WHERE assigned_to_user_id IS NOT NULL;

-- Composite index for filtering by priority and status (for dashboard stats)
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_status ON public.support_tickets(priority, status);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);

-- =============================================
-- ADD COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON INDEX idx_support_tickets_user_status IS 'Optimizes queries for drivers viewing their tickets filtered by status';
COMMENT ON INDEX idx_support_tickets_assigned_status IS 'Optimizes queries for customer support viewing assigned tickets by status';
COMMENT ON INDEX idx_support_tickets_priority_status IS 'Optimizes dashboard statistics queries filtering by priority and status';

