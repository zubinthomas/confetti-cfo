// ⚠️  AUTH DISABLED FOR PROTOTYPING — all endpoints return success
import { Router } from 'express';

const router = Router();

const DEV_USER = { id: 'dev-user', email: 'dev@local', full_name: 'Dev User' };

router.post('/register',              (_req, res) => res.json({ message: 'ok' }));
router.post('/verify-otp',            (_req, res) => res.json({ access_token: 'dev-token' }));
router.post('/resend-otp',            (_req, res) => res.json({ message: 'ok' }));
router.post('/login',                 (_req, res) => res.json({ access_token: 'dev-token' }));
router.get('/me',                     (_req, res) => res.json(DEV_USER));
router.post('/logout',                (_req, res) => res.json({ message: 'ok' }));
router.post('/reset-password-request',(_req, res) => res.json({ message: 'ok' }));
router.post('/reset-password',        (_req, res) => res.json({ message: 'ok' }));
router.get('/google',                 (_req, res) => res.redirect('/?access_token=dev-token'));
router.get('/google/callback',        (_req, res) => res.redirect('/?access_token=dev-token'));

export default router;
