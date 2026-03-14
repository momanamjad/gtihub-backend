import express from 'express';
import Repository from '../models/Repository.js';
import Star from '../models/Star.js';
import Pin from '../models/Pin.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// CREATE REPO
router.post('/', auth, async (req, res) => {
  try {
    const repo = new Repository({ ...req.body, owner: req.user.id });
    await repo.save();
    res.json(repo);
  } catch (err) { res.status(500).send('Server error'); }
});

// GET MY REPOS
router.get('/', auth, async (req, res) => {
  try {
    const repos = await Repository.find({ owner: req.user.id }).sort({ created_at: -1 });
    res.json(repos);
  } catch (err) { res.status(500).send('Server error'); }
});

// DELETE REPO
router.delete('/:id', auth, async (req, res) => {
  try {
    const repo = await Repository.findById(req.params.id);
    if (!repo) return res.status(404).json({ message: 'Repo not found' });
    if (repo.owner.toString() !== req.user.id) return res.status(401).json({ message: 'Unauthorized' });

    await Star.deleteMany({ repository: req.params.id });
    await Pin.deleteMany({ repository: req.params.id });
    await repo.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).send('Server error'); }
});

// STAR (TOGGLE)
router.post('/:id/star', auth, async (req, res) => {
  try {
    const existing = await Star.findOne({ user: req.user.id, repository: req.params.id });
    if (existing) {
      await existing.deleteOne();
      await Repository.findByIdAndUpdate(req.params.id, { $inc: { stars_count: -1 } });
      return res.json({ message: 'Unstarred' });
    }
    await new Star({ user: req.user.id, repository: req.params.id }).save();
    await Repository.findByIdAndUpdate(req.params.id, { $inc: { stars_count: 1 } });
    res.json({ message: 'Starred' });
  } catch (err) { res.status(500).send('Server error'); }
});

// PIN (TOGGLE)
router.post('/:id/pin', auth, async (req, res) => {
  try {
    const existing = await Pin.findOne({ user: req.user.id, repository: req.params.id });
    if (existing) {
      await existing.deleteOne();
      return res.json({ message: 'Unpinned' });
    }
    const count = await Pin.countDocuments({ user: req.user.id });
    if (count >= 6) return res.status(400).json({ message: 'Max 6 pins allowed' });

    const pin = new Pin({ user: req.user.id, repository: req.params.id, order: count });
    await pin.save();
    res.json({ message: 'Pinned' });
  } catch (err) { res.status(500).send('Server error'); }
});

export default router;