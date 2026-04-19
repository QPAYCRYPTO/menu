// packages/shared/src/types.ts
export type UserRole = 'admin' | 'superadmin' | 'owner';

export interface SessionUser {
  user_id: string;
  business_id: string | null;
  email: string;
  role: UserRole;
  password_version: number;
}

export interface RequestContext {
  userId?: string;
  businessId?: string;
  requestId: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  role: UserRole;
  email: string;
  business_id: string | null;
  business_name: string | null;
}

export interface RefreshResponse {
  access_token: string;
}

export interface CategoryResponse {
  id: string;
  business_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface ProductResponse {
  id: string;
  business_id: string;
  category_id: string;
  name: string;
  description: string;
  price_int: number;
  image_url: string | null;
  thumb_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface BusinessSettingsResponse {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  theme_color: string | null;
  bg_color: string | null;
  dark_mode: boolean;
  description: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  contact_instagram: string | null;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  sort_order: number;
  products: Array<{
    id: string;
    category_id: string;
    name: string;
    description: string;
    price_int: number;
    image_url: string | null;
    thumb_url: string | null;
    sort_order: number;
  }>;
}

export interface PublicMenuResponse {
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string | null;
    theme_color?: string | null;
    bg_color?: string | null;
    dark_mode?: boolean;
    contact_phone?: string | null;
    contact_email?: string | null;
    contact_whatsapp?: string | null;
  };
  categories: PublicMenuCategory[];
}

export interface UploadResponse {
  image_url: string;
  thumb_url: string;
}