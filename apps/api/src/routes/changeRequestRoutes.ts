// apps/api/src/routes/changeRequestRoutes.ts
// Admin: onaya düşen sipariş değişiklikleri — /api/admin/change-requests
//   GET  /                → bekleyen talepler (siparişi hâlâ açık olanlar)
//   POST /:id/approve     → uygula (iptal / adet azaltma)
//   POST /:id/reject      → reddet (sipariş aynen kalır); body: { note? }
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { ChangeRequestError, decideRequest, listPendingRequests } from '../services/changeRequestService.js';

export const changeRequestRoutes = Router();
changeRequestRoutes.use(requireAuth);
changeRequestRoutes.use(requireAdmin);

const idParams = z.object({ id: z.string().uuid() });
const decideBody = z.object({ note: z.string().trim().max(300).optional() });

changeRequestRoutes.get('/', async (req, res) => {
  const businessId = req.ctx!.businessId!;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(await listPendingRequests(businessId));
});

for (const decision of ['approve', 'reject'] as const) {
  changeRequestRoutes.post(`/:id/${decision}`, async (req, res) => {
    const params = idParams.safeParse(req.params);
    const body = decideBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      res.status(400).json({ message: 'Geçersiz parametre.' });
      return;
    }
    try {
      const result = await decideRequest(
        req.ctx!.businessId!, req.ctx!.userId!, params.data.id, decision, body.data.note || null
      );
      const message = result.status === 'approved'
        ? (result.request.kind === 'order_cancel' ? 'İade onaylandı, sipariş iptal edildi.' : 'İade onaylandı, adet güncellendi.')
        : result.status === 'rejected'
          ? 'Talep reddedildi.'
          : 'Sipariş bu arada değiştiği için talep geçersiz sayıldı.';
      res.status(200).json({ status: result.status, message });
    } catch (err) {
      if (err instanceof ChangeRequestError) {
        res.status(err.status).json({ message: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });
}
