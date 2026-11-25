import jwt from 'jsonwebtoken';
import { errorResponse } from '../utils/responseFormatter.js';

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'test' ? 'github_clone_test_jwt_secret' : undefined
);
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable must be set.');
}

export const auth = (req, res, next) => {
  const token = req.cookies?.accessToken || req.header('x-auth-token') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  
  if (!token) {
    return errorResponse(res, 'No token, authorization denied', 401);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token expired', 401);
    }
    return errorResponse(res, 'Token is not valid', 401);
  }
};

export const optionalAuth = (req, res, next) => {
  const token = req.cookies?.accessToken || req.header('x-auth-token') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError') {
      console.warn('Unexpected auth error:', err.message);
    }
    // If token is invalid or expired, continue as guest
    next();
  }
};

export default auth;
