import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js'; // I'll need to export app from index.js
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

describe('Auth API', () => {
  let token;
  const testUser = {
    login: 'testuser',
    email: 'test@example.com',
    password: 'password123'
  };

  beforeAll(async () => {
    // Connect to database if not connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    // Clean up test user
    await User.deleteMany({ email: testUser.email });
  });

  afterAll(async () => {
    await User.deleteMany({ email: testUser.email });
    await mongoose.connection.close();
  });

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    token = res.body.token;
  });

  it('should login an existing user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    token = res.body.token;
  });

  it('should get current user info', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('x-auth-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.email).toEqual(testUser.email);
  });

  it('should change password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('x-auth-token', token)
      .send({
        oldPassword: testUser.password,
        newPassword: 'newpassword123'
      });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toEqual('Password updated successfully');
  });

  it('should search for users', async () => {
    const res = await request(app)
      .get('/api/auth/search?q=test');
    
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });
});
