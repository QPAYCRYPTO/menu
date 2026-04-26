// apps/web/src/api/superadminApi.ts
// Super admin tarafının tüm API çağrıları burada toplanır.
// UI bileşenleri bu dosyadaki fonksiyonları kullanır.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

export type Business = {
  id: string;
  name: string;
  slug: string;
  admin_email: string | null;
  owner_count: number;
  is_active: boolean;
  created_at: string;
  category_count: number;
  product_count: number;
  waiter_module_enabled: boolean;
};

export type Owner = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? 'Bir hata oluştu.');
  }
  return data as T;
}

// ─────────────────────────────────────────────────────────────
// İŞLETME (BUSINESS) CRUD
// ─────────────────────────────────────────────────────────────

export async function listBusinesses(token: string): Promise<Business[]> {
  const res = await fetch(`${API_BASE_URL}/superadmin/businesses`, {
    headers: headers(token)
  });
  return handleResponse<Business[]>(res);
}

export async function createBusiness(
  token: string,
  payload: { business_name: string; slug: string; email: string; password: string }
) {
  const res = await fetch(`${API_BASE_URL}/superadmin/businesses`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload)
  });
  return handleResponse<{ business_id: string; user_id: string; slug: string; email: string }>(res);
}

export async function toggleBusinessActive(token: string, businessId: string, isActive: boolean) {
  const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${businessId}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ is_active: isActive })
  });
  return handleResponse<Business>(res);
}

export async function resetAdminPassword(token: string, businessId: string, newPassword: string) {
  const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${businessId}/reset-password`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ new_password: newPassword })
  });
  return handleResponse<{ message: string }>(res);
}

// ─────────────────────────────────────────────────────────────
// OWNER CRUD
// ─────────────────────────────────────────────────────────────

export async function listOwners(token: string, businessId: string): Promise<Owner[]> {
  const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${businessId}/owners`, {
    headers: headers(token)
  });
  return handleResponse<Owner[]>(res);
}

export async function createOwner(
  token: string,
  businessId: string,
  payload: { email: string; password: string }
): Promise<Owner> {
  const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${businessId}/owners`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload)
  });
  return handleResponse<Owner>(res);
}

export async function toggleOwnerActive(
  token: string,
  businessId: string,
  userId: string,
  isActive: boolean
): Promise<Owner> {
  const res = await fetch(
    `${API_BASE_URL}/superadmin/businesses/${businessId}/owners/${userId}`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify({ is_active: isActive })
    }
  );
  return handleResponse<Owner>(res);
}

export async function deleteOwner(token: string, businessId: string, userId: string) {
  const res = await fetch(
    `${API_BASE_URL}/superadmin/businesses/${businessId}/owners/${userId}`,
    {
      method: 'DELETE',
      headers: headers(token)
    }
  );
  return handleResponse<{ message: string }>(res);
}

export async function resetOwnerPassword(
  token: string,
  businessId: string,
  userId: string,
  newPassword: string
) {
  const res = await fetch(
    `${API_BASE_URL}/superadmin/businesses/${businessId}/owners/${userId}/reset-password`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify({ new_password: newPassword })
    }
  );
  return handleResponse<{ message: string }>(res);
}

// ─────────────────────────────────────────────────────────────
// GARSON MODÜLÜ FLAG
// ─────────────────────────────────────────────────────────────

export async function toggleWaiterModule(
  token: string,
  businessId: string,
  enabled: boolean
): Promise<{ ok: boolean; enabled: boolean }> {
  const res = await fetch(`${API_BASE_URL}/superadmin/businesses/${businessId}/waiter-module`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ enabled })
  });
  return handleResponse<{ ok: boolean; enabled: boolean }>(res);
}