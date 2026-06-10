import jwt from 'jsonwebtoken';
import { errorResponse } from '../utils/responseFormatter.js';

export const auth = (req, res, next) => {
  const token = req.cookies?.accessToken || req.header('x-auth-token') || req.header('authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return errorResponse(res, 'No token, authorization denied', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token expired', 401);
    }
    return errorResponse(res, 'Token is not valid', 401);
  }
};

export default auth;
