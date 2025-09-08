export class DocumentResponseDto {
    id: string;
    user_id: string;
    doc_type: string;
    file_path: string;
    file_name: string;
    file_size_bytes: number;
    mime_type?: string;
    public_url?: string;
    verification_status: string;
    notes?: string;
    reviewed_at?: string;
    reviewer_user_id?: string;
    uploaded_at: string;
    updated_at: string;

    constructor(partial: Partial<DocumentResponseDto>) {
        Object.assign(this, partial);
    }
}

export class DocumentUploadResponseDto {
    id: string;
    user_id: string;
    file_name: string;
    file_path: string;
    file_size_bytes: number;
    mime_type?: string;
    public_url?: string;
    doc_type: string;
    verification_status: string;
    notes?: string;
    uploaded_at: string;
    message?: string;

    constructor(partial: Partial<DocumentUploadResponseDto>) {
        Object.assign(this, partial);
    }
}

export class DocumentStatsDto {
    totalDocuments: number;
    pendingReview: number;
    verified: number;
    rejected: number;
    documentsByType: Record<string, number>;
    documentsByUser: Record<string, number>;
    averageFileSize: number;
    totalStorageUsed: number;

    constructor(partial: Partial<DocumentStatsDto>) {
        Object.assign(this, partial);
    }
}

export class UserDocumentsSummaryDto {
    userId: string;
    totalDocuments: number;
    verifiedDocuments: number;
    pendingDocuments: number;
    rejectedDocuments: number;
    requiredDocuments: string[];
    missingDocuments: string[];
    documents: DocumentResponseDto[];

    constructor(partial: Partial<UserDocumentsSummaryDto>) {
        Object.assign(this, partial);
    }
}

export class DocumentVerificationDto {
    id: string;
    doc_type: string;
    file_name: string;
    verification_status: string;
    notes?: string;
    reviewed_at?: string;
    reviewer_user_id?: string;
    user_info?: {
        id: string;
        display_name?: string;
        phone_e164?: string;
    };

    constructor(partial: Partial<DocumentVerificationDto>) {
        Object.assign(this, partial);
    }
}
