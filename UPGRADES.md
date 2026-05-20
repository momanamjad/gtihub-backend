# GitHub Backend - Upgrades Documentation

## 🎯 Overview
This document outlines all the upgrades and improvements made to the GitHub Clone backend API.

---

## 📦 Dependencies Added

### Security & Validation
- **helmet** (^7.1.0) - Secures HTTP headers
- **express-rate-limit** (^7.1.5) - Rate limiting middleware
- **joi** (^17.11.0) - Schema validation library

### Documentation & API
- **swagger-jsdoc** (^6.2.8) - Swagger/OpenAPI documentation
- **swagger-ui-express** (^5.0.0) - Swagger UI interface

---

## 🔐 Security Enhancements

### 1. **Helmet Security Headers**
- Protects against common web vulnerabilities
- Configurable CORS with whitelist
- See `index.js` for configuration

### 2. **Rate Limiting**
```javascript
- General: 100 requests per 15 minutes per IP
- Auth Endpoints: 5 requests per 15 minutes per IP
```

### 3. **Input Validation**
- All request payloads validated using Joi
- Query parameters validated
- See `utils/validators.js` for all schemas

---

## 🏗️ Code Architecture Improvements

### Directory Structure
```
backend/
├── config/
│   └── swagger.js           # Swagger/OpenAPI configuration
├── controllers/             # Business logic (reserved for future)
├── services/                # Service layer for business logic
│   ├── authService.js       # Auth operations
│   ├── userService.js       # User operations (follow, notifications)
│   └── repoService.js       # Repository operations
├── utils/
│   ├── validators.js        # Joi validation schemas
│   ├── errorHandler.js      # Centralized error handling
│   ├── responseFormatter.js # Consistent response format
│   └── validate.js          # Validation middleware
├── middleware/
│   └── auth.js              # JWT authentication
├── models/
│   ├── user.js              # Updated with indexes & new fields
│   ├── repository.js        # Updated with indexes & soft delete
│   ├── star.js              # Updated with indexes
│   ├── pin.js               # Updated with indexes
│   ├── follower.js          # NEW - Follow system
│   ├── issue.js             # NEW - Issues/bugs
│   └── notification.js      # NEW - Notifications
└── routes/
    ├── auth.js              # Authentication endpoints
    ├── repos.js             # Repository endpoints
    └── users.js             # NEW - User operations (followers, notifications)
```

---

## 📝 API Improvements

### 1. **Validation & Error Handling**
- ✅ Input validation on all endpoints
- ✅ Consistent error responses with proper HTTP status codes
- ✅ Detailed validation error messages
- ✅ Async error handling wrapper

### 2. **Pagination Support**
All list endpoints now support:
```javascript
{
  page: 1,
  limit: 10,
  sort: '-created_at'
}
```

Paginated responses include:
```javascript
{
  success: true,
  data: [...],
  pagination: {
    page: 1,
    limit: 10,
    total: 50,
    pages: 5
  }
}
```

### 3. **Standard Response Format**
All API responses follow this format:
```javascript
// Success
{
  success: true,
  message: "Operation successful",
  data: {...}
}

// Error
{
  success: false,
  message: "Error description",
  errors: [...] // optional
}
```

---

## 🆕 New Endpoints

### User Follow System
```
POST   /api/users/:id/follow           - Toggle follow user
GET    /api/users/:id/followers        - Get user followers
GET    /api/users/:id/following        - Get users following
```

### Notifications
```
GET    /api/users/notifications        - Get user notifications
PUT    /api/users/notifications/:id    - Mark notification as read
```

### Repository Management
```
GET    /api/repos/public/explore       - Explore public repositories
GET    /api/repos/search/query         - Search repositories
POST   /api/repos/:id/issues           - Create issue
GET    /api/repos/:id/issues           - Get repository issues
```

### Improved Auth Endpoints
```
GET    /api/auth/search?q=...&page=1   - Search users with pagination
```

---

## 🗄️ Database Improvements

### 1. **Database Indexes**
Added indexes for fast queries:
```javascript
// User model
- login (unique)
- email (unique)
- login + name (text search)

// Repository model
- owner + is_deleted
- visibility + is_deleted
- name + description (text search)

// Star model
- user + repository (unique compound)

// Pin model
- user + repository (unique compound)

// Follower model
- follower + following (unique compound)

// Issue model
- repository + state
- creator

// Notification model
- user + isRead
- user + created_at (sorting)
```

### 2. **Soft Delete Support**
Repositories support soft delete:
- `is_deleted` flag instead of physical deletion
- Automatically filtered from queries
- Preserves data integrity and relationships

### 3. **Counters for Performance**
Added denormalized counters:
```javascript
User: {
  followers_count,
  following_count,
  public_repos_count
}

Repository: {
  stars_count,
  forks_count,
  watchers_count,
  issues_count
}
```

---

## 📊 New Models

### 1. **Follower Model**
```javascript
{
  follower: ObjectId,    // User following
  following: ObjectId,   // User being followed
  created_at: Date
}
```

### 2. **Issue Model**
```javascript
{
  repository: ObjectId,
  creator: ObjectId,
  assignee: ObjectId,
  title: String,
  description: String,
  state: 'open' | 'closed',
  labels: [String],
  comments_count: Number,
  is_deleted: Boolean,
  created_at: Date,
  updated_at: Date
}
```

### 3. **Notification Model**
```javascript
{
  user: ObjectId,        // Recipient
  actor: ObjectId,       // Action performer
  type: 'follow' | 'star' | 'issue' | 'comment',
  repository: ObjectId,
  issue: ObjectId,
  message: String,
  isRead: Boolean,
  created_at: Date
}
```

---

## 📚 API Documentation

### Swagger UI
- **URL**: `http://localhost:5000/api/docs`
- **Features**:
  - Interactive API explorer
  - Try-out functionality
  - Authorization support
  - Request/response examples

### Endpoints Documented
All endpoints now include:
- Description
- Parameters
- Request/response schemas
- Security requirements
- Example values

---

## 🛡️ Error Handling

### Error Types Handled
1. **Validation Errors** - Joi schema validation failures
2. **Authentication Errors** - Invalid/expired tokens
3. **Authorization Errors** - Permission denied
4. **Database Errors** - MongoDB duplicate key, validation, etc.
5. **Not Found Errors** - Resource doesn't exist
6. **Rate Limit Errors** - Too many requests

### Error Response Format
```javascript
{
  success: false,
  message: "User already exists",
  errors: [
    {
      field: "email",
      message: "\"email\" is not allowed to be empty"
    }
  ]
}
```

---

## 🔄 Response Examples

### Paginated Response
```javascript
GET /api/repos?page=1&limit=10

{
  success: true,
  message: "Repositories retrieved",
  data: [...],
  pagination: {
    page: 1,
    limit: 10,
    total: 50,
    pages: 5
  }
}
```

### Error Response
```javascript
{
  success: false,
  message: "Validation Error",
  errors: [
    {
      field: "password",
      message: "\"password\" length must be at least 6 characters long"
    }
  ]
}
```

---

## 📋 Validation Schemas

All validators available in `utils/validators.js`:
- `registerValidator` - User registration
- `loginValidator` - User login
- `changePasswordValidator` - Password change
- `updateProfileValidator` - Profile updates
- `createRepoValidator` - Repository creation
- `updateRepoValidator` - Repository updates
- `searchValidator` - User search with pagination
- `paginationValidator` - Generic pagination params

---

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Running the Server
```bash
# Development
npm run dev

# Production
npm start
```

### Testing
```bash
npm test
```

---

## 📖 Authentication

### JWT Token
Supported headers:
```javascript
// Standard Bearer token
Authorization: Bearer <token>

// Custom header
x-auth-token: <token>
```

### Token Expiration
- **Duration**: 7 days
- **Error**: Returns 401 if expired

---

## 🔄 Notification System

### Notification Types
1. **follow** - User followed
2. **star** - Repository starred
3. **issue** - Issue created
4. **comment** - Comment added

### Notification Features
- Auto-generated on events
- Mark as read functionality
- List with pagination
- Unread count tracking

---

## 📊 Performance Optimizations

1. **Database Indexes** - Faster queries
2. **Denormalized Counters** - Avoid expensive aggregations
3. **Soft Delete** - Logical deletion preserves relations
4. **Pagination** - Limits data transfer
5. **Text Indexes** - Full-text search support
6. **Query Optimization** - Efficient population of related data

---

## ✅ Checklist of Improvements

- [x] Input Validation with Joi
- [x] Centralized Error Handling
- [x] Helmet Security Headers
- [x] Rate Limiting
- [x] Pagination Support
- [x] Standard Response Format
- [x] Service Layer Architecture
- [x] Database Indexes
- [x] Soft Delete Support
- [x] Notification System
- [x] Follow System
- [x] Issue Management
- [x] Search Functionality
- [x] Swagger API Documentation
- [x] Async Error Handling
- [x] CORS Configuration
- [x] Health Check Endpoint
- [x] Query Validation Middleware
- [x] Denormalized Counters

---

## 🔮 Future Enhancements

- [ ] Pull Request System
- [ ] Code Review Comments
- [ ] Branch Management
- [ ] Webhook Integration
- [ ] OAuth2 Social Login
- [ ] Two-Factor Authentication
- [ ] Email Notifications
- [ ] WebSocket Real-time Updates
- [ ] API Key Authentication
- [ ] GraphQL API

---

## 📞 Support

For issues or questions about the upgrades, refer to the Swagger documentation at `/api/docs`
