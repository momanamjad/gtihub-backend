import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import User from '../models/User.js';
import Repository from '../models/Repository.js';
import dotenv from 'dotenv';

dotenv.config();

describe('Repos API', () => {
  let token;
  let repoId;
  const testUser = {
    login: 'repotester',
    email: 'repotester@example.com',
    password: 'password123'
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    await User.deleteMany({ email: testUser.email });
    const regRes = await request(app).post('/api/auth/register').send(testUser);
    token = regRes.body.token;
  });

  afterAll(async () => {
    await Repository.deleteMany({ owner: (await User.findOne({ email: testUser.email }))._id });
    await User.deleteMany({ email: testUser.email });
    await mongoose.connection.close();
  });

  it('should create a new repository', async () => {
    const res = await request(app)
      .post('/api/repos')
      .set('x-auth-token', token)
      .send({
        name: 'test-repo',
        description: 'a test repository'
      });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.name).toEqual('test-repo');
    repoId = res.body._id;
  });

  it('should get user repositories', async () => {
    const res = await request(app)
      .get('/api/repos')
      .set('x-auth-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should toggle star on repo', async () => {
    const res = await request(app)
      .post(`/api/repos/${repoId}/star`)
      .set('x-auth-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(['Starred', 'Unstarred']).toContain(res.body.message);
  });

  it('should toggle pin on repo', async () => {
    const res = await request(app)
      .post(`/api/repos/${repoId}/pin`)
      .set('x-auth-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(['Pinned', 'Unpinned']).toContain(res.body.message);
  });

  it('should delete a repository', async () => {
    const res = await request(app)
      .delete(`/api/repos/${repoId}`)
      .set('x-auth-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toEqual('Deleted');
  });
});
