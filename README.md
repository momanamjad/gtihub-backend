# 🚀 GitHub Clone Backend API

A full-featured backend API for a GitHub clone application built with Node.js, Express, and MongoDB.

## ✨ Features

- **User Authentication** - JWT-based registration and login with HttpOnly secure token storage
- **Brute Force Lockout** - 30-minute account locking after 5 consecutive incorrect password checks
- **Repository Management** - Create, read, update, delete repositories using fast projections and lean reads
- **Social Features** - Follow/unfollow users, star repositories, pin favorites
- **Issue Tracking** - Create and manage repository issues
- **Notifications** - Real-time notifications for user actions
- **Search** - Search users and repositories
- **Security** - Input validation, rate limiting, helmet CSP headers with dynamic nonces, Swagger token protection
- **API Documentation** - Interactive Swagger/OpenAPI docs gated behind security checks
- **Database Optimizations** - Mongoose pool tuning and compound indexes
- **Error Handling** - Global unhandled promise rejection and process exception catching

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens) in HttpOnly cookies
- **Security**: Helmet, bcryptjs, express-rate-limit
- **Validation**: Joi
- **Documentation**: Swagger/OpenAPI
- **Password**: bcryptjs

## 📦 Installation

### Prerequisites
- Node.js (v18+)
- MongoDB
- npm or yarn

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd github-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Create environment file**
```bash
cp .env.example .env
```

4. **Configure environment variables**
```env
MONGODB_URI=mongodb://localhost:27017/github-clone
PORT=5000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key_here_change_in_production
CORS_ORIGIN=http://localhost:3000,http://localhost:5000
DOCS_TOKEN=your_swagger_token_here
```

5. **Start MongoDB**
```bash
# If using MongoDB locally
mongod
```

6. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

Server will run on `http://localhost:5000`

## 📚 API Documentation

### Swagger UI
Interactive API documentation available in development at:
```
http://localhost:5000/api/docs
```
*Note: In production environments, access requires the `DOCS_TOKEN` passed as a query string or `x-docs-token` header.*

### Health Check
```
GET http://localhost:5000/health
```

## 🔐 Authentication

All protected endpoints require HttpOnly cookie verification.

x-auth-token: <jwt_token>
```

### Getting a Token
1. Register: `POST /api/auth/register`
2. Login: `POST /api/auth/login`
3. Use returned token in subsequent requests

## 🗂️ Project Structure

```
github-backend/
├── config/
│   └── swagger.js                 # API documentation config
├── middleware/
│   └── auth.js                    # JWT authentication
├── models/
│   ├── user.js                    # User schema
│   ├── repository.js              # Repository schema
│   ├── star.js                    # Star schema
│   ├── pin.js                     # Pin schema
│   ├── follower.js                # Follower schema
│   ├── issue.js                   # Issue schema
│   └── notification.js            # Notification schema
├── services/
│   ├── authService.js             # Auth business logic
│   ├── userService.js             # User business logic
│   └── repoService.js             # Repository business logic
├── routes/
│   ├── auth.js                    # Authentication endpoints
│   ├── repos.js                   # Repository endpoints
│   └── users.js                   # User endpoints
├── utils/
│   ├── validators.js              # Joi validation schemas
│   ├── errorHandler.js            # Error handling
│   ├── responseFormatter.js       # Response formatting
│   └── validate.js                # Validation middleware
├── index.js                       # Server entry point
└── package.json
```

## 🔗 API Endpoints

### Authentication
```
POST   /api/auth/register           - Register new user
POST   /api/auth/login              - Login user
GET    /api/auth/me                 - Get current user (protected)
GET    /api/auth/user/:username     - Get public user profile
POST   /api/auth/change-password    - Change password (protected)
GET    /api/auth/search             - Search users
PUT    /api/auth/profile            - Update profile (protected)
```

### Repositories
```
POST   /api/repos                   - Create repository (protected)
GET    /api/repos                   - Get user's repositories (protected)
GET    /api/repos/public/explore    - Explore public repositories
GET    /api/repos/:id               - Get repository details
PUT    /api/repos/:id               - Update repository (protected)
DELETE /api/repos/:id               - Delete repository (protected)
POST   /api/repos/:id/star          - Toggle star (protected)
POST   /api/repos/:id/pin           - Toggle pin (protected)
GET    /api/repos/search/query      - Search repositories
POST   /api/repos/:id/issues        - Create issue (protected)
GET    /api/repos/:id/issues        - Get repository issues
```

### Users
```
POST   /api/users/:id/follow        - Toggle follow user (protected)
GET    /api/users/:id/followers     - Get user followers
GET    /api/users/:id/following     - Get users following
GET    /api/users/notifications     - Get notifications (protected)
PUT    /api/users/notifications/:id - Mark notification as read (protected)
```

## 📋 Request/Response Examples

### Register User
**Request:**
```javascript
POST /api/auth/register
Content-Type: application/json

{
  "login": "username",
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```javascript
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "login": "username",
      "email": "user@example.com"
    }
  }
}
```

### Create Repository
**Request:**
```javascript
POST /api/repos
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "awesome-project",
  "description": "An awesome project",
  "language": "JavaScript",
  "visibility": "public"
}
```

**Response:**
```javascript
{
  "success": true,
  "message": "Repository created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "awesome-project",
    "owner": "507f1f77bcf86cd799439011",
    "stars_count": 0,
    "created_at": "2024-05-20T10:30:00Z"
  }
}
```

### Get Paginated Results
**Request:**
```javascript
GET /api/repos?page=1&limit=10&sort=-created_at
```

**Response:**
```javascript
{
  "success": true,
  "message": "Repositories retrieved",
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "pages": 5
  }
}
```

## 🚨 Error Handling

### Error Response Format
```javascript
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "\"email\" is not allowed to be empty"
    }
  ]
}
```

### Common Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## 🔒 Security Features

- **Helmet**: Protects against common web vulnerabilities
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Configurable cross-origin access
- **JWT**: Secure token-based authentication
- **Bcrypt**: Password hashing and salting
- **Input Validation**: All inputs validated with Joi
- **Error Handling**: No sensitive data in error messages

## 🗄️ Database Schema

All models include timestamps (`created_at`, `updated_at`) and proper indexes for performance.

### User Model
```javascript
{
  login: String (unique),
  email: String (unique),
  password: String (hashed),
  name: String,
  bio: String,
  avatar_url: String,
  followers_count: Number,
  following_count: Number,
  public_repos_count: Number
}
```

### Repository Model
```javascript
{
  owner: ObjectId,
  name: String,
  description: String,
  language: String,
  visibility: 'public' | 'private',
  stars_count: Number,
  forks_count: Number,
  watchers_count: Number,
  issues_count: Number,
  topics: [String],
  is_deleted: Boolean
}
```

## 📊 Performance Optimizations

- Database indexes on frequently queried fields
- Denormalized counters to avoid expensive aggregations
- Pagination for list endpoints
- Text indexes for full-text search
- Efficient query population
- Connection pooling with MongoDB

## 🧪 Testing

```bash
npm test
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017/github-clone |
| `PORT` | Server port | 5000 |
| `NODE_ENV` | Environment | development |
| `JWT_SECRET` | JWT signing secret | (required) |
| `CORS_ORIGIN` | Allowed CORS origins | http://localhost:3000,http://localhost:5000 |

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests
4. Submit a pull request

## 📄 License

ISC

## 🔗 Useful Links

- [Express Documentation](https://expressjs.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [JWT Guide](https://jwt.io/)
- [Joi Validation](https://joi.dev/)
- [Helmet.js](https://helmetjs.github.io/)

## 👥 Support

For issues or questions:
1. Check the [Swagger Documentation](/api/docs)
2. Review the [UPGRADES.md](./UPGRADES.md) file for detailed changes
3. Create an issue in the repository

---

**Last Updated**: May 2024
**Version**: 2.0.0 (Upgraded)