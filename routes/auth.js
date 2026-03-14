import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import Repository from '../models/repository.js';
import Pin from '../models/pin.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { login, email, password } = req.body;
    let user = await User.findOne({ $or: [{ email }, { login }] });
    if (user) return res.status(400).json({ message: "User already exists" });

    user = new User({ login, email, password });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { login: user.login, email: user.email } });
  } catch (err) { res.status(500).send('Server error'); }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid Credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid Credentials" });

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { login: user.login, email: user.email } });
  } catch (err) { res.status(500).send('Server error'); }
});

// GET ME
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) { res.status(500).send('Server error'); }
});

// PUBLIC PROFILE
router.get('/user/:username', async (req, res) => {
  try {
    const user = await User.findOne({ login: req.params.username }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const repos = await Repository.find({ owner: user._id });
    const pins = await Pin.find({ user: user._id }).populate('repository').sort('order');
    res.json({ user, repos, pins });
  } catch (err) { res.status(500).send('Server error'); }
});

// CHANGE PASSWORD
router.post('/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid current password" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) { res.status(500).send('Server error'); }
});

// USER SEARCH
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    const users = await User.find({ login: { $regex: query, $options: 'i' } }).select('login name avatar_url');
    res.json(users);
  } catch (err) { res.status(500).send('Server error'); }
});
// UPDATE PROFILE
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, bio, avatar_url } = req.body;
    const user = await User.findById(req.user.id);
    if (name) user.name = name;
    if (bio) user.bio = bio;
    if (avatar_url) user.avatar_url = avatar_url;
    await user.save();
    res.json(user);
  } catch (err) { res.status(500).send('Server error'); }
});

export default router;
