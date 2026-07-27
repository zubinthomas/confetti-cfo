import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { authMiddleware, requirePermission } from '../middleware/auth.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// All integration routes require authentication
router.use(authMiddleware);

// ── File upload ───────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/**
 * POST /api/integrations/upload
 * Returns { file_url } for the uploaded file.
 */
router.post('/upload', requirePermission('Integration', 'write'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file provided' });
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
  const file_url = `${serverUrl}/uploads/${req.file.filename}`;
  res.json({ file_url });
});

// ── LLM proxy ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 1024;
// Anthropic's API requires a numeric max_tokens - there's no true "unlimited",
// so MAX_TOKENS=unlimited falls back to this safe high cap for that provider.
const ANTHROPIC_UNLIMITED_MAX_TOKENS = 8192;

/** Reads MAX_TOKENS from .env. Returns undefined for "unlimited" (let the provider decide). */
function resolveMaxTokens(): number | undefined {
  const raw = process.env.MAX_TOKENS?.trim().toLowerCase();
  if (!raw) return DEFAULT_MAX_TOKENS;
  if (raw === 'unlimited' || raw === '0' || raw === '-1') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_TOKENS;
}

/**
 * POST /api/integrations/llm
 * Body: { prompt: string }
 * Returns { text: string }
 *
 * Uses Anthropic API by default. Set ANTHROPIC_API_KEY in .env.
 * Alternatively set LLM_PROVIDER=openai and OPENAI_API_KEY,
 * or LLM_PROVIDER=openrouter and OPENROUTER_API_KEY.
 *
 * Set MAX_TOKENS to cap response length (default 1024), or MAX_TOKENS=unlimited
 * to let the model use as much as it needs (OpenAI/OpenRouter only - Anthropic
 * falls back to ANTHROPIC_UNLIMITED_MAX_TOKENS since it requires a numeric cap).
 */
router.post('/llm', requirePermission('Integration', 'read'), async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: 'prompt is required' });

    const provider = process.env.LLM_PROVIDER || 'anthropic';
    const maxTokens = resolveMaxTokens();

    // ⚠️  No API key → return a mock response for prototyping
    const hasKey = provider === 'anthropic'  ? !!process.env.ANTHROPIC_API_KEY
                 : provider === 'openai'     ? !!process.env.OPENAI_API_KEY
                 : provider === 'openrouter' ? !!process.env.OPENROUTER_API_KEY
                 : false;
    if (!hasKey) {
      return res.json({ text: `## Mock AI Response\n\n**Prompt received:** ${prompt.slice(0, 120)}…\n\n_Set \`ANTHROPIC_API_KEY\` (or \`OPENAI_API_KEY\` / \`OPENROUTER_API_KEY\`) in \`server/.env\` to get real answers._` });
    }

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(501).json({ message: 'ANTHROPIC_API_KEY not set in .env' });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: maxTokens ?? ANTHROPIC_UNLIMITED_MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic error:', err);
        return res.status(502).json({ message: 'LLM request failed' });
      }

      const data = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
      return res.json({ text });
    }

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(501).json({ message: 'OPENAI_API_KEY not set in .env' });

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('OpenAI error:', err);
        return res.status(502).json({ message: 'LLM request failed' });
      }

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';
      return res.json({ text });
    }

    if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(501).json({ message: 'OPENROUTER_API_KEY not set in .env' });

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('OpenRouter error:', err);
        return res.status(502).json({ message: 'LLM request failed' });
      }

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';
      return res.json({ text });
    }

    res.status(400).json({ message: `Unknown LLM_PROVIDER: ${provider}` });
  } catch (err) {
    console.error('LLM route error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
