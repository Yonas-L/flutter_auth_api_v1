# Cloudinary Integration Guide

## 📁 Folder Structure

The Cloudinary integration uses a user-centric folder structure that's optimized for frontend integration:

```
uploads/
├── {userId}/
│   ├── avatar/
│   │   └── avatar_{timestamp}
│   └── documents/
│       ├── driver_license_{timestamp}
│       ├── vehicle_registration_{timestamp}
│       └── insurance_{timestamp}
```

## 🚀 API Endpoints

### 1. User Registration Upload
**POST** `/documents/cloudinary/upload-registration`

Upload avatar + 3 required documents in one request.

**Request:**
- `files`: 4 files (avatar + 3 documents)
- `user_id`: User ID
- `notes`: Optional notes

**Response:**
```json
{
  "avatar": {
    "id": "uuid",
    "user_id": "uuid",
    "doc_type": "profile_picture",
    "file_path": "uploads/{userId}/avatar/avatar_{timestamp}",
    "public_url": "https://res.cloudinary.com/...",
    "verification_status": "pending_review"
  },
  "documents": [
    {
      "id": "uuid",
      "doc_type": "driver_license",
      "file_path": "uploads/{userId}/documents/driver_license_{timestamp}",
      "public_url": "https://res.cloudinary.com/..."
    },
    {
      "id": "uuid", 
      "doc_type": "vehicle_registration",
      "file_path": "uploads/{userId}/documents/vehicle_registration_{timestamp}",
      "public_url": "https://res.cloudinary.com/..."
    },
    {
      "id": "uuid",
      "doc_type": "insurance", 
      "file_path": "uploads/{userId}/documents/insurance_{timestamp}",
      "public_url": "https://res.cloudinary.com/..."
    }
  ],
  "errors": []
}
```

### 2. Avatar Upload
**POST** `/documents/cloudinary/upload-avatar`

Upload profile picture only.

**Request:**
- `file`: Image file
- `user_id`: User ID
- `notes`: Optional notes

### 3. Document Upload
**POST** `/documents/cloudinary/upload`

Upload single document.

**Request:**
- `file`: Document file
- `user_id`: User ID
- `doc_type`: Document type
- `notes`: Optional notes

### 4. Driver Documents Upload
**POST** `/documents/cloudinary/upload-driver-docs`

Upload 3 required driver documents.

**Request:**
- `files`: 3 files
- `user_id`: User ID
- `notes`: Optional notes

### 5. Get User Files
**GET** `/documents/cloudinary/user/{userId}/files`

Get all files for a user from Cloudinary.

**Response:**
```json
{
  "avatars": [
    {
      "public_id": "uploads/{userId}/avatar/avatar_{timestamp}",
      "secure_url": "https://res.cloudinary.com/...",
      "created_at": "2025-09-08T20:00:00Z",
      "bytes": 1024000,
      "format": "jpg"
    }
  ],
  "documents": [
    {
      "public_id": "uploads/{userId}/documents/driver_license_{timestamp}",
      "secure_url": "https://res.cloudinary.com/...",
      "created_at": "2025-09-08T20:00:00Z",
      "bytes": 2048000,
      "format": "pdf"
    }
  ],
  "folderStructure": {
    "baseFolder": "uploads/{userId}",
    "avatarFolder": "uploads/{userId}/avatar",
    "documentsFolder": "uploads/{userId}/documents"
  }
}
```

### 6. Delete User Files
**DELETE** `/documents/cloudinary/user/{userId}/files`

Delete all files for a user (for account deletion).

**Response:**
```json
{
  "deleted": ["public_id_1", "public_id_2"],
  "failed": [],
  "message": "Deleted 2 files, 0 failed"
}
```

### 7. Health Check
**GET** `/documents/cloudinary/health`

Check Cloudinary connection status.

## 🔧 Frontend Integration

### Registration Flow
```javascript
// 1. Upload registration files
const formData = new FormData();
formData.append('files', avatarFile);
formData.append('files', driverLicenseFile);
formData.append('files', vehicleRegistrationFile);
formData.append('files', insuranceFile);
formData.append('user_id', userId);

const response = await fetch('/documents/cloudinary/upload-registration', {
  method: 'POST',
  body: formData
});

const result = await response.json();
// result.avatar contains avatar info
// result.documents contains document info
```

### File Management
```javascript
// 2. Get user files
const filesResponse = await fetch(`/documents/cloudinary/user/${userId}/files`);
const userFiles = await filesResponse.json();

// userFiles.avatars - all avatar files
// userFiles.documents - all document files
// userFiles.folderStructure - folder paths
```

### URL Generation
```javascript
// 3. Generate optimized URLs
const avatarUrl = cloudinary.url(publicId, {
  width: 200,
  height: 200,
  crop: 'fill',
  gravity: 'face'
});

const documentUrl = cloudinary.url(publicId, {
  quality: 'auto',
  format: 'auto'
});
```

## 📋 File Types Supported

### Images (for avatars and vehicle photos)
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)

### Documents
- PDF (.pdf)
- DOCX (.docx)
- DOC (.doc)

## 🔒 Security Features

1. **File Type Validation**: Only allowed file types are accepted
2. **File Size Limits**: 10MB maximum per file
3. **User Isolation**: Each user's files are in separate folders
4. **Database Integration**: All uploads are tracked in PostgreSQL
5. **Verification Status**: Documents require admin verification

## 🌐 Environment Variables

Add these to your `.env` file:

```bash
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=dbgepm3xy
CLOUDINARY_KEY=523756119649921
CLOUDINARY_SECRET=B33mpoVwb_RN66edfGUAguU2sqE
CLOUDINARY_URL=cloudinary://523756119649921:B33mpoVwb_RN66edfGUAguU2sqE@dbgepm3xy
```

## 🎯 Benefits for Frontend Integration

1. **Organized Structure**: Easy to find and manage user files
2. **Bulk Operations**: Upload all registration files at once
3. **File Management**: List, delete, and organize user files
4. **URL Optimization**: Generate optimized URLs for different use cases
5. **Error Handling**: Comprehensive error reporting
6. **Scalability**: Cloudinary handles CDN and optimization automatically

## 📱 Mobile App Integration

The folder structure makes it easy for mobile apps to:
- Upload files during registration
- Display user avatars and documents
- Manage file permissions
- Handle offline scenarios
- Sync files across devices

## 🔄 Migration from Local Storage

If migrating from local storage:
1. Upload existing files to Cloudinary using the new structure
2. Update database records with new `file_path` and `public_url`
3. Update frontend to use Cloudinary URLs
4. Remove local storage dependencies
