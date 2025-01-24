# Auth Service

Authentication and authorization service for the ManKahi Blogging Platform.

## Features

- JWT-based authentication
- Google OAuth integration
- Role-based access control (RBAC)
- Redis-based session management
- Rate limiting
- Secure password hashing with Argon2
- TypeScript support
- Docker ready

## Prerequisites

- Node.js 20 or later
- PostgreSQL 15
- Redis
- Docker and Docker Compose (for containerized deployment)

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `DATABASE_URL` - PostgreSQL connection URL
- `REDIS_URL` - Redis connection URL
- `JWT_SECRET` - JWT signing key (min 32 chars)
- `JWT_EXPIRES_IN` - JWT expiration time
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `CORS_ORIGIN` - Allowed CORS origin

## API Endpoints

### Authentication

- `POST /api/auth/register`
  - Register new user
  - Body: `{ username, email, password }`

- `POST /api/auth/login`
  - Login user
  - Body: `{ email, password }`

- `POST /api/auth/logout`
  - Logout user (requires authentication)
  - Header: `Authorization: Bearer <token>`

- `GET /api/auth/google`
  - Initiate Google OAuth flow

- `GET /api/auth/google/callback`
  - Google OAuth callback URL

### Role Management

- `POST /api/auth/roles`
  - Add role to user (requires admin role)
  - Body: `{ userId, roleName }`
  - Header: `Authorization: Bearer <token>`

## Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## Docker Deployment

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f auth-service

# Stop services
docker-compose down
```

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Security Features

1. **Password Security**
   - Argon2id hashing algorithm
   - Configurable memory and time cost factors

2. **Rate Limiting**
   - Separate limits for auth and API endpoints
   - Redis-based rate limiting
   - Configurable windows and limits

3. **Token Management**
   - JWT with configurable expiration
   - Token blacklisting on logout
   - Redis-based token storage

4. **RBAC**
   - Granular role-based access control
   - Default roles: reader, writer, admin
   - Extendable permission system

## Error Handling

The service uses standardized error responses:

```json
{
  "message": "Error message",
  "errors": [] // Validation errors if applicable
}
```

HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 409: Conflict
- 429: Too Many Requests
- 500: Internal Server Error

## Contributing

1. Create feature branch
2. Commit changes
3. Create pull request
4. Ensure tests pass

## License

This project is proprietary and confidential.
