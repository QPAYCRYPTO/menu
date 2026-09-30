-- ==============================================================================
-- 020_staff_permissions_v2.sql
-- AtlasQR — Personel yetkileri (piyasa modeli: Toast / SambaPOS)
-- ==============================================================================
--   Eski → yeni:
--     can_delete_items  → can_refund       Mutfak başladıktan sonra (Hazırlanıyor/Hazır) iptal/azaltma = İADE.
--                                          Yetkisi yoksa admin onayına düşer. Mutfak başlamadan ("Bekliyor")
--                                          iptal/azaltma herkese serbesttir, yetki gerekmez.
--     can_add_note      → kaldırıldı       Not yazmak garsonun temel işi; hiçbir yerde uygulanmıyordu.
--     (yeni) can_edit_other_tables         Başka personelin masasında işlem (sipariş, adet, iptal, taşıma).
--                                          Mevcut personelde bugünkü davranış korunur: TRUE.
--   can_see_other_tables / can_transfer_table / can_merge_tables / can_use_break aynen kalır.
-- ==============================================================================

UPDATE waiters
SET permissions = (
      permissions
      || jsonb_build_object(
           'can_refund', COALESCE((permissions->>'can_refund')::boolean, (permissions->>'can_delete_items')::boolean, false),
           'can_edit_other_tables', COALESCE((permissions->>'can_edit_other_tables')::boolean, true)
         )
    ) - 'can_delete_items' - 'can_add_note';

ALTER TABLE waiters ALTER COLUMN permissions SET DEFAULT '{
    "can_refund": false,
    "can_see_other_tables": true,
    "can_edit_other_tables": false,
    "can_transfer_table": true,
    "can_merge_tables": false,
    "can_use_break": true
}'::jsonb;
