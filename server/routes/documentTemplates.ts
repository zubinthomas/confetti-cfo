// Document templates (ID cards, salary slips) - see server/db/documentTemplates.ts
// for the storage/validation layer. Split in two along permission lines:
// the admin list/CRUD routes need DocumentTemplate:read/write, but /render
// (and /options, which only backs a template picker) need nothing beyond
// being logged in - see permissions.ts's comment on the DocumentTemplate
// resource for why that's safe. Nobody loses the ability to download a card
// or slip just because they don't manage templates.
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { authMiddleware, requirePermission, type AuthedRequest } from '../middleware/auth.ts';
import {
  DocumentTemplateError, DOC_TYPES, FIELD_CATALOG, PAGE_SIZE_MM, type DocType,
  listTemplates, listTemplateOptions, getTemplateForRender, createTemplate, updateTemplate,
  deleteTemplate, setDefaultTemplate,
} from '../db/documentTemplates.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
router.use(authMiddleware);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const status = (err: unknown) => (err instanceof DocumentTemplateError ? 400 : 500);

function asDocType(v: unknown): DocType {
  if (!DOC_TYPES.includes(v as DocType)) throw new DocumentTemplateError('docType must be id_card or salary_slip');
  return v as DocType;
}

// ── Consumption (no DocumentTemplate permission needed) ─────────────────────

router.get('/render', async (req, res) => {
  try {
    const docType = asDocType(req.query.docType);
    const id = typeof req.query.id === 'string' ? req.query.id : undefined;
    const row = await getTemplateForRender(docType, id);
    res.json({ id: row.id, name: row.name, docType: row.docType, elements: row.elements });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.get('/options', async (req, res) => {
  try {
    const docType = asDocType(req.query.docType);
    res.json({ templates: await listTemplateOptions(docType) });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.get('/field-catalog', (req, res) => {
  try {
    const docType = asDocType(req.query.docType);
    res.json({ fields: FIELD_CATALOG[docType], page: PAGE_SIZE_MM[docType] });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Admin list + mutation ────────────────────────────────────────────────────

router.get('/', requirePermission('DocumentTemplate', 'read'), async (req, res) => {
  try {
    const docType = typeof req.query.docType === 'string' ? asDocType(req.query.docType) : undefined;
    res.json({ templates: await listTemplates(docType) });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.post('/', requirePermission('DocumentTemplate', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name, docType, elements } = req.body ?? {};
    res.status(201).json(await createTemplate(req.user!.id, name, docType, elements));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.put('/:id', requirePermission('DocumentTemplate', 'write'), async (req: AuthedRequest, res) => {
  try {
    const { name, elements } = req.body ?? {};
    res.json(await updateTemplate(req.user!.id, req.params.id, name, elements));
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.put('/:id/default', requirePermission('DocumentTemplate', 'write'), async (req: AuthedRequest, res) => {
  try {
    await setDefaultTemplate(req.user!.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

router.delete('/:id', requirePermission('DocumentTemplate', 'write'), async (req, res) => {
  try {
    await deleteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(status(err)).json({ message: message(err) });
  }
});

// ── Background image upload (for from-scratch or uploaded-background templates) ──

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/upload', requirePermission('DocumentTemplate', 'write'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file provided' });
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
  res.json({ file_url: `${serverUrl}/uploads/${req.file.filename}` });
});

export default router;
