// apps/api/src/routes/tableRoutes.ts
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/postgres.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeText } from '../utils/sanitize.js';

const createTableSchema = z.object({
  name: z.string().min(1).max(60),
  sort_order: z.number().int().min(1).optional()
});

const updateTableSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  sort_order: z.number().int().min(1).optional(),
  is_active: z.boolean().optional()
});

export const tableRoutes = Router();
tableRoutes.use(requireAuth);

// Tüm masaları listele
tableRoutes.get('/', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const result = await pool.query(
    `SELECT id, business_id, name, sort_order, is_active, created_at
     FROM tables
     WHERE business_id = $1
     ORDER BY sort_order ASC`,
    [businessId]
  );
  res.status(200).json(result.rows);
});

// Masa ekle
tableRoutes.post('/', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const parsed = createTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz masa verisi.' });
    return;
  }
  const name = sanitizeText(parsed.data.name);
  const result = await pool.query(
    `INSERT INTO tables (id, business_id, name, sort_order, is_active, created_at, updated_at)
     VALUES (
       gen_random_uuid(), $1, $2,
       COALESCE($3, (SELECT COALESCE(MAX(sort_order) + 1, 1) FROM tables WHERE business_id = $1)),
       TRUE, NOW(), NOW()
     )
     RETURNING id, business_id, name, sort_order, is_active`,
    [businessId, name, parsed.data.sort_order ?? null]
  );
  res.status(201).json(result.rows[0]);
});

// Masa güncelle
tableRoutes.put('/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { id } = req.params;
  const parsed = updateTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Geçersiz masa verisi.' });
    return;
  }
  const name = parsed.data.name ? sanitizeText(parsed.data.name) : null;
  const result = await pool.query(
    `UPDATE tables
     SET name = COALESCE($1, name),
         sort_order = COALESCE($2, sort_order),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
     WHERE id = $4 AND business_id = $5
     RETURNING id, business_id, name, sort_order, is_active`,
    [name, parsed.data.sort_order ?? null, parsed.data.is_active ?? null, id, businessId]
  );
  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Masa bulunamadı.' });
    return;
  }
  res.status(200).json(result.rows[0]);
});

// Masa sil
tableRoutes.delete('/:id', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  const { id } = req.params;
  const result = await pool.query(
    `DELETE FROM tables WHERE id = $1 AND business_id = $2 RETURNING id`,
    [id, businessId]
  );
  if (result.rowCount !== 1) {
    res.status(404).json({ message: 'Masa bulunamadı.' });
    return;
  }
  res.status(204).send();
});