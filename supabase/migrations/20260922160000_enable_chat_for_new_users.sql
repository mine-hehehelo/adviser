-- Self-service registration grants ordinary chat access after authentication.
-- The auth trigger uses this default only when creating a profile. Existing
-- blocks and admin roles are preserved, including on subsequent auth updates.
alter table public.profiles
  alter column is_allowed set default true;
