export type UserRole = 'admin' | 'employee';
export type SessionStatus = 'active' | 'completed';

export interface Company {
  id: string;
  name: string;
}

export interface CompanyMember {
  user_id: string;
  company_id: string;
  role: UserRole;
}

export interface Location {
  id: string;
  company_id: string;
  name: string;
}

export interface Category {
  id: string;
  location_id: string;
  name: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  last_known_quantity: number | null;
}

export interface InventorySession {
  id: string;
  location_id: string;
  created_at: string;
  status: SessionStatus;
}

export interface InventoryCount {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  updated_by: string;
  updated_at: string;
}
