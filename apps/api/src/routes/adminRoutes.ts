import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/postgres.js';
import { requireAuth, requireAdminOrOwnerRead } from '../middleware/auth.js';
import { invalidateBusinessMenuCache } from '../services/menuService.js';
import { processImage, processLogo, validateUpload } from '../services/uploadService.js';
import { sanitizeText } from '../utils/sanitize.js';
import { env } from '../config/env.js';

// ─────────────────────────────────────────────────────────────
// MULTER CONFIG (Düzeltildi)
// - GIF eklendi
// - Limit 3MB → 5MB (frontend ile uyumlu)
// - Reddedildiğinde net hata mesajı
// ─────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_IMAGE_MIMETYPES.has(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error(
        `Desteklenmeyen dosya türü: ${file.mimetype}. Sadece JPG, PNG, WebP, GIF kabul edilir.`
      ));
    }
  }
});

// Multer hata yakalayıcı middleware
function handleUploadError(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'Dosya 5MB\'dan büyük olamaz.' });
      return;
    }
    res.status(400).json({ message: err.message });
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ message: err.message });
    return;
  }
  next(err);
}

// ─────────────────────────────────────────────────────────────

const createCategorySchema = z.object({
  name: z.string().min(1).max(120)
});

const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(1).optional()
  })
  .refine((value) => value.name !== undefined || value.is_active !== undefined || value.sort_order !== undefined, {
    message: 'En az bir alan gönderilmelidir.'
  });

// İşletme ayarları: alan gönderilmezse (undefined) mevcut değer korunur; boş metin ("") ya da null → NULL yazılır
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const PHONE = /^\+?[\d\s\-()]{7,20}$/;
const clearable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable()).optional();

const businessUpdateSchema = z.object({
  name: z.string().trim().min(1, 'İşletme adı boş olamaz.').max(120).optional(),
  logo_url: clearable(z.string().url().max(500)),
  theme_color: z.string().regex(HEX_COLOR, 'Tema rengi #RRGGBB biçiminde olmalı.').optional(),
  bg_color: z.string().max(32).optional(),
  dark_mode: z.boolean().optional(),
  description: clearable(z.string().max(2000)),
  contact_name: clearable(z.string().max(120)),
  contact_phone: clearable(z.string().trim().regex(PHONE, 'Telefon numarası geçersiz.')),
  contact_email: clearable(z.string().trim().email('E-posta adresi geçersiz.').max(160)),
  contact_whatsapp: clearable(z.string().trim().regex(PHONE, 'WhatsApp numarası geçersiz.')),
  contact_instagram: clearable(z.string().max(120)),
  address: clearable(z.string().max(500)),
  wifi_name: clearable(z.string().max(64)),
  wifi_password: clearable(z.string().max(128)),
  is_accepting_orders: z.boolean().optional(),
  late_after_minutes: z.number().int().min(1, 'Teslim süresi en az 1 dk olmalı.').max(240, 'Teslim süresi en fazla 240 dk olabilir.').optional()
});

type BusinessUpdate = z.infer<typeof businessUpdateSchema>;

/** Sütun → değeri nasıl yazacağımız. Metinler HTML'den arındırılır; Wi-Fi şifresi olduğu gibi saklanır
 *  (ekranda React zaten kaçışlar, arındırma "<" gibi karakterleri bozardı). 'value': boolean/sayı, olduğu gibi. */
const BUSINESS_COLUMNS: Array<{ key: keyof BusinessUpdate; kind: 'text' | 'raw' | 'value' }> = [
  { key: 'name', kind: 'text' },
  { key: 'logo_url', kind: 'raw' },
  { key: 'theme_color', kind: 'raw' },
  { key: 'bg_color', kind: 'text' },
  { key: 'dark_mode', kind: 'value' },
  { key: 'description', kind: 'text' },
  { key: 'contact_name', kind: 'text' },
  { key: 'contact_phone', kind: 'text' },
  { key: 'contact_email', kind: 'text' },
  { key: 'contact_whatsapp', kind: 'text' },
  { key: 'contact_instagram', kind: 'text' },
  { key: 'address', kind: 'text' },
  { key: 'wifi_name', kind: 'text' },
  { key: 'wifi_password', kind: 'raw' },
  { key: 'is_accepting_orders', kind: 'value' },
  { key: 'late_after_minutes', kind: 'value' }
];

const BUSINESS_SETTINGS_FIELDS = `id, name, slug, logo_url, theme_color, bg_color, dark_mode,
            description, contact_name, contact_phone, contact_email, contact_whatsapp, contact_instagram,
            address, wifi_name, wifi_password, is_accepting_orders, late_after_minutes,
            waiter_module_enabled, kitchen_module_enabled`;

const getProductsQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20)
});

const createProductSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().min(1).max(160),
  price_int: z.number().int().nonnegative(),
  description: z.string().max(4000).optional(),
  image_url: z.string().url().max(500).optional(),
  sort_order: z.number().int().min(1).optional(),
  is_active: z.boolean().optional()
});

const updateProductSchema = z
  .object({
    category_id: z.string().uuid().optional(),
    name: z.string().min(1).max(160).optional(),
    price_int: z.number().int().nonnegative().optional(),
    description: z.string().max(4000).optional(),
    image_url: z.string().url().max(500).optional(),
    sort_order: z.number().int().min(1).optional(),
    is_active: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.category_id !== undefined ||
      value.name !== undefined ||
      value.price_int !== undefined ||
      value.description !== undefined ||
      value.image_url !== undefined ||
      value.sort_order !== undefined ||
      value.is_active !== undefined,
    { message: 'En az bir alan gönderilmelidir.' }
  );

async function assertCategoryBelongsBusiness(categoryId: string, businessId: string): Promise<boolean> {
  const result = await pool.query(`SELECT id FROM categories WHERE id = $1 AND business_id = $2`, [categoryId, businessId]);
  return result.rowCount === 1;
}

export const adminRoutes = Router();
adminRoutes.use(requireAuth);
// Owner yalnızca işletme ayarlarını okuyabilir; diğer her şey admin
adminRoutes.use(requireAdminOrOwnerRead(['/business']));

adminRoutes.get('/business', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const result = await pool.query(
    `SELECT ${BUSINESS_SETTINGS_FIELDS}
     FROM businesses
     WHERE id = $1`,
    [businessId]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  res.status(200).json(result.rows[0]);
});

adminRoutes.put('/business', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const parsed = businessUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    // Alan bazlı mesaj (ör. "Tema rengi #RRGGBB biçiminde olmalı.") kullanıcıya gösterilir
    const first = parsed.error.issues[0];
    const field = first?.path[0];
    res.status(400).json({
      message: first?.message && !first.message.startsWith('Invalid') && !first.message.startsWith('Expected')
        ? first.message
        : 'Geçersiz işletme ayarları verisi.',
      field: typeof field === 'string' ? field : undefined
    });
    return;
  }

  const payload = parsed.data;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const { key, kind } of BUSINESS_COLUMNS) {
    const value = payload[key];
    if (value === undefined) continue; // gönderilmedi → dokunma
    let dbValue: unknown;
    if (kind === 'value') {
      dbValue = value;
    } else if (value === null || value === '') {
      dbValue = null; // boşaltıldı → NULL
    } else {
      const text = String(value);
      dbValue = kind === 'text' ? sanitizeText(text) || null : text;
    }
    params.push(dbValue);
    sets.push(`${key} = $${params.length}`);
  }

  if (sets.length === 0) {
    res.status(400).json({ message: 'En az bir alan gönderilmelidir.' });
    return;
  }
  params.push(businessId);

  const result = await pool.query(
    `UPDATE businesses
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING ${BUSINESS_SETTINGS_FIELDS}`,
    params
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  const slug = String(result.rows[0].slug);
  await invalidateBusinessMenuCache(slug);

  res.status(200).json(result.rows[0]);
});

adminRoutes.get('/qr', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { content, table_id } = req.query;

  const bizResult = await pool.query(
    'SELECT slug, theme_color FROM businesses WHERE id = $1',
    [businessId]
  );
  if (bizResult.rowCount !== 1) {
    res.status(404).json({ message: 'İşletme bulunamadı.' });
    return;
  }

  const { slug, theme_color } = bizResult.rows[0];
  const themeColor = theme_color ?? '#0F172A';

  const qrContent = (content && typeof content === 'string')
    ? content
    : `${env.publicBaseUrl}/m/${slug}`;

  const png = await QRCode.toBuffer(qrContent, {
    type: 'png',
    width: 512,
    margin: 2,
    color: { dark: themeColor, light: '#FFFFFF' }
  });

  if (table_id && typeof table_id === 'string') {
    const tableResult = await pool.query(
      'SELECT id, qr_url FROM tables WHERE id = $1 AND business_id = $2',
      [table_id, businessId]
    );
    if (tableResult.rowCount === 1 && !tableResult.rows[0].qr_url) {
      const key = `business/${businessId}/tables/${table_id}_qr.png`;
      const { uploadToS3 } = await import('../services/storageService.js');
      const qrUrl = await uploadToS3(key, png, 'image/png');
      await pool.query('UPDATE tables SET qr_url = $1, updated_at = NOW() WHERE id = $2', [qrUrl, table_id]);
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'image/png');
  res.status(200).send(png);
});

adminRoutes.get('/categories', async (req, res) => {
  const businessId = req.ctx!.businessId!;

  const result = await pool.query(
    `SELECT id, business_id, name, is_active, sort_order, created_at, updated_at
     FROM categories
     WHERE business_id = $1
     ORDER BY sort_order ASC`,
    [businessId]
  );

  res.status(200).json(result.rows);
});

adminRoutes.post('/categories', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const parsed = createCategorySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz kategori verisi.' });
    return;
  }

  const name = sanitizeText(parsed.data.name);

  const result = await pool.query(
    `INSERT INTO categories (id, business_id, name, sort_order, is_active, created_at, updated_at)
     VALUES (
       gen_random_uuid(),
       $1,
       $2,
       COALESCE((SELECT MAX(sort_order) + 1 FROM categories WHERE business_id = $1), 1),
       TRUE,
       NOW(),
       NOW()
     )
     RETURNING id, business_id, name, is_active, sort_order`,
    [businessId, name]
  );

  res.status(201).json(result.rows[0]);
});

adminRoutes.put('/categories/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const id = req.params.id;
  const parsed = updateCategorySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz kategori güncelleme verisi.' });
    return;
  }

  const name = parsed.data.name !== undefined ? sanitizeText(parsed.data.name) : null;
  const isActive = parsed.data.is_active ?? null;
  const sortOrder = parsed.data.sort_order ?? null;

  const result = await pool.query(
    `UPDATE categories
     SET name = COALESCE($1, name),
         is_active = COALESCE($2, is_active),
         sort_order = COALESCE($3, sort_order),
         updated_at = NOW()
     WHERE id = $4 AND business_id = $5
     RETURNING id, business_id, name, is_active, sort_order, created_at, updated_at`,
    [name, isActive, sortOrder, id, businessId]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Kategori bulunamadı.' });
    return;
  }

  const biz = await pool.query(`SELECT slug FROM businesses WHERE id = $1`, [businessId]);
  if (biz.rowCount === 1) await invalidateBusinessMenuCache(biz.rows[0].slug);

  res.status(200).json(result.rows[0]);
});

adminRoutes.delete('/categories/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const id = req.params.id;

  const result = await pool.query(
    `UPDATE categories
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1 AND business_id = $2
     RETURNING id`,
    [id, businessId]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Kategori bulunamadı.' });
    return;
  }

  const biz = await pool.query(`SELECT slug FROM businesses WHERE id = $1`, [businessId]);
  if (biz.rowCount === 1) await invalidateBusinessMenuCache(biz.rows[0].slug);

  res.status(204).send();
});

// Ürün görseli upload (handleUploadError eklendi)
adminRoutes.post('/upload', upload.single('file'), handleUploadError, async (req, res) => {
  const businessId = req.ctx!.businessId!;
  if (!req.file) { res.status(400).json({ message: 'Dosya zorunludur.' }); return; }

  try {
    validateUpload(req.file.size, req.file.mimetype);
    const image = await processImage(req.file.buffer, businessId);
    res.status(200).json({ image_url: image.imageUrl, thumb_url: image.thumbUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Görsel yüklenemedi.';
    res.status(400).json({ message: msg });
  }
});

// Logo upload — ayrı endpoint (handleUploadError eklendi)
adminRoutes.post('/upload/logo', upload.single('file'), handleUploadError, async (req, res) => {
  const businessId = req.ctx!.businessId!;
  if (!req.file) { res.status(400).json({ message: 'Dosya zorunludur.' }); return; }

  let logoUrl: string;
  try {
    validateUpload(req.file.size, req.file.mimetype);
    logoUrl = await processLogo(req.file.buffer, businessId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Logo yüklenemedi.';
    res.status(400).json({ message: msg });
    return;
  }

  // DB'ye kaydet ve cache temizle
  const result = await pool.query(
    `UPDATE businesses SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING slug`,
    [logoUrl, businessId]
  );
  if (result.rowCount === 1) await invalidateBusinessMenuCache(result.rows[0].slug);

  res.status(200).json({ logo_url: logoUrl });
});

adminRoutes.get('/products', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const parsed = getProductsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz ürün listeleme parametreleri.' });
    return;
  }

  const { category_id: categoryId, page, page_size: pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;

  if (categoryId && !(await assertCategoryBelongsBusiness(categoryId, businessId))) {
    res.status(400).json({ message: 'Kategori işletmeye ait değil.' });
    return;
  }

  const params: Array<string | number> = [businessId];
  let categoryFilter = '';

  if (categoryId) {
    params.push(categoryId);
    categoryFilter = ` AND category_id = $${params.length}`;
  }

  params.push(pageSize);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;

  const result = await pool.query(
    `SELECT id, business_id, category_id, name, price_int, description, image_url, thumb_url, sort_order, is_active, created_at, updated_at
     FROM products
     WHERE business_id = $1${categoryFilter}
     ORDER BY sort_order ASC, created_at DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );

  res.status(200).json(result.rows);
});

adminRoutes.post('/products', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const parsed = createProductSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz ürün verisi.' });
    return;
  }

  if (!(await assertCategoryBelongsBusiness(parsed.data.category_id, businessId))) {
    res.status(400).json({ message: 'Kategori işletmeye ait değil.' });
    return;
  }

  const name = sanitizeText(parsed.data.name);
  const description = parsed.data.description ? sanitizeText(parsed.data.description) : null;
  const imageUrl = parsed.data.image_url ?? null;
  const isActive = parsed.data.is_active ?? true;

  const result = await pool.query(
    `INSERT INTO products (id, business_id, category_id, name, price_int, description, image_url, sort_order, is_active, created_at, updated_at)
     VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      COALESCE($7, (SELECT COALESCE(MAX(sort_order) + 1, 1) FROM products WHERE business_id = $1)),
      $8,
      NOW(),
      NOW()
     )
     RETURNING id, business_id, category_id, name, price_int, description, image_url, thumb_url, sort_order, is_active, created_at, updated_at`,
    [businessId, parsed.data.category_id, name, parsed.data.price_int, description, imageUrl, parsed.data.sort_order ?? null, isActive]
  );

  const biz = await pool.query(`SELECT slug FROM businesses WHERE id = $1`, [businessId]);
  if (biz.rowCount === 1) await invalidateBusinessMenuCache(biz.rows[0].slug);

  res.status(201).json(result.rows[0]);
});

adminRoutes.put('/products/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const id = req.params.id;
  const parsed = updateProductSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz ürün güncelleme verisi.' });
    return;
  }

  if (parsed.data.category_id && !(await assertCategoryBelongsBusiness(parsed.data.category_id, businessId))) {
    res.status(400).json({ message: 'Kategori işletmeye ait değil.' });
    return;
  }

  const name = parsed.data.name !== undefined ? sanitizeText(parsed.data.name) : null;
  const description = parsed.data.description !== undefined ? sanitizeText(parsed.data.description) : null;

  const result = await pool.query(
    `UPDATE products
     SET category_id = COALESCE($1, category_id),
         name = COALESCE($2, name),
         price_int = COALESCE($3, price_int),
         description = COALESCE($4, description),
         image_url = COALESCE($5, image_url),
         sort_order = COALESCE($6, sort_order),
         is_active = COALESCE($7, is_active),
         updated_at = NOW()
     WHERE id = $8 AND business_id = $9
     RETURNING id, business_id, category_id, name, price_int, description, image_url, thumb_url, sort_order, is_active, created_at, updated_at`,
    [
      parsed.data.category_id ?? null,
      name,
      parsed.data.price_int ?? null,
      description,
      parsed.data.image_url ?? null,
      parsed.data.sort_order ?? null,
      parsed.data.is_active ?? null,
      id,
      businessId
    ]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Ürün bulunamadı.' });
    return;
  }

  const biz = await pool.query(`SELECT slug FROM businesses WHERE id = $1`, [businessId]);
  if (biz.rowCount === 1) await invalidateBusinessMenuCache(biz.rows[0].slug);

  res.status(200).json(result.rows[0]);
});

adminRoutes.delete('/products/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const id = req.params.id;

  const result = await pool.query(
    `UPDATE products
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1 AND business_id = $2
     RETURNING id`,
    [id, businessId]
  );

  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Ürün bulunamadı.' });
    return;
  }

  const biz = await pool.query(`SELECT slug FROM businesses WHERE id = $1`, [businessId]);
  if (biz.rowCount === 1) await invalidateBusinessMenuCache(biz.rows[0].slug);

  res.status(204).send();
});