export interface Document {
    id: string;
    user_id: string;
    doc_type: string;
    file_path: string;
    file_name: string;
    file_size_bytes?: number;
    mime_type?: string;
    public_url?: string;
    verification_status: 'pending_review' | 'verified' | 'rejected';
    notes?: string;
    reviewed_at?: string;
    reviewer_user_id?: string;
    uploaded_at: string;
    updated_at: string;
}

export interface CreateDocumentData {
    user_id: string;
    doc_type: string;
    file_path: string;
    file_name: string;
    file_size_bytes: number;
    mime_type?: string;
    public_url?: string;
    verification_status?: Document['verification_status'];
    notes?: string;
    reviewer_user_id?: string;
}

export interface UpdateDocumentData {
    file_path?: string;
    file_name?: string;
    mime_type?: string;
    public_url?: string;
    verification_status?: Document['verification_status'];
    notes?: string;
    reviewed_at?: string;
    reviewer_user_id?: string;
}
