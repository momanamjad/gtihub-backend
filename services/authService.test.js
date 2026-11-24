/**
 * Auth Service Unit Tests
 * Uses Jest ESM + unstable_mockModule for ES module mocking
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// ── Chainable Mongoose query helper ──
// Returns an object that supports .select().lean() and is directly awaitable
const mockQuery = (value) => {
  const selectResult = {
    lean: jest.fn().mockResolvedValue(value),
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
  return {
    select: jest.fn().mockReturnValue(selectResult),
    lean: jest.fn().mockResolvedValue(value),
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
};

// ── Mock ES modules BEFORE importing the module under test ──
jest.unstable_mockModule('../models/user.js', () => ({
  default: {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: jest.fn(),
    compare: jest.fn(),
  },
}));

// Dynamic import AFTER mocks are registered
const { default: User } = await import('../models/user.js');
const { default: bcrypt } = await import('bcryptjs');
const authService = await import('./authService.js');

// ─────────────────────────────────────────────
// Helper: build a fake user document
// ─────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  _id: 'user123',
  id: 'user123',
  email: 'test@example.com',
  password: 'hashedpassword',
  loginAttempts: 0,
  lockUntil: null,
  refreshToken: null,
  toObject: jest.fn().mockReturnValue({
    _id: 'user123',
    email: 'test@example.com',
    loginAttempts: 0,
  }),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────
// generateTokens
// ─────────────────────────────────────────────
describe('generateTokens', () => {
  test('returns accessToken and refreshToken JWT strings', () => {
    const { accessToken, refreshToken } = authService.generateTokens('abc123');
    expect(accessToken.split('.')).toHaveLength(3);
    expect(refreshToken.split('.')).toHaveLength(3);
  });

  test('encodes the correct userId in the access token payload', () => {
    const { accessToken } = authService.generateTokens('myUserId');
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString()
    );
    expect(payload.user.id).toBe('myUserId');
  });
});

// ─────────────────────────────────────────────
// login
// ─────────────────────────────────────────────
describe('login', () => {
  test('throws "Invalid Credentials" when user not found', async () => {
    User.findOne.mockReturnValue(mockQuery(null));
    await expect(
      authService.login({ email: 'nope@x.com', password: 'pass' })
    ).rejects.toThrow('Invalid Credentials');
  });

  test('throws "temporarily locked" when lockUntil is in the future', async () => {
    User.findOne.mockReturnValue(
      mockQuery(makeUser({ lockUntil: new Date(Date.now() + 60_000) }))
    );
    await expect(
      authService.login({ email: 'test@example.com', password: 'pass' })
    ).rejects.toThrow(/temporarily locked/i);
  });

  test('increments loginAttempts on wrong password', async () => {
    User.findOne.mockReturnValue(mockQuery(makeUser({ loginAttempts: 1 })));
    bcrypt.compare.mockResolvedValue(false);
    User.findByIdAndUpdate.mockResolvedValue({});

    await expect(
      authService.login({ email: 'test@example.com', password: 'wrong' })
    ).rejects.toThrow('Invalid Credentials');

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', { loginAttempts: 2 });
  });

  test('locks account after 5 failed attempts', async () => {
    User.findOne.mockReturnValue(mockQuery(makeUser({ loginAttempts: 4 })));
    bcrypt.compare.mockResolvedValue(false);
    User.findByIdAndUpdate.mockResolvedValue({});

    await expect(
      authService.login({ email: 'test@example.com', password: 'wrong' })
    ).rejects.toThrow('Invalid Credentials');

    const [, updatePayload] = User.findByIdAndUpdate.mock.calls[0];
    expect(updatePayload).toMatchObject({ loginAttempts: 0 });
    expect(updatePayload.lockUntil).toBeInstanceOf(Date);
  });

  test('returns tokens and sanitised user on success', async () => {
    User.findOne.mockReturnValue(mockQuery(makeUser()));
    bcrypt.compare.mockResolvedValue(true);
    User.findByIdAndUpdate.mockResolvedValue({});

    const result = await authService.login({
      email: 'test@example.com',
      password: 'correct',
    });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user.password).toBeUndefined();
  });

  test('uses findByIdAndUpdate (not save) on successful login — the perf fix', async () => {
    const user = makeUser();
    User.findOne.mockReturnValue(mockQuery(user));
    bcrypt.compare.mockResolvedValue(true);
    User.findByIdAndUpdate.mockResolvedValue({});

    await authService.login({ email: 'test@example.com', password: 'correct' });

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({ loginAttempts: 0, $unset: { lockUntil: 1 } })
    );
    // The plain object user has no .save() — confirms we don't call it
    expect(user.save).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// register
// ─────────────────────────────────────────────
describe('register', () => {
  test('throws if user already exists', async () => {
    User.findOne.mockReturnValue(mockQuery({ _id: 'existing' }));
    await expect(
      authService.register({ login: 'moman', email: 'x@x.com', password: '123456' })
    ).rejects.toThrow('User already exists');
  });
});
