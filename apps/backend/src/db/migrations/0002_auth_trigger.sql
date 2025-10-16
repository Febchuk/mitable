-- Migration: Auth User Sync Trigger
-- This trigger automatically creates a user profile in the 'users' table
-- when a new user signs up via Supabase Auth

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  org_id uuid;
BEGIN
  -- Extract organization_id from user metadata
  -- If not provided, we'll need to handle this in application code
  org_id := (NEW.raw_user_meta_data->>'organization_id')::uuid;

  -- Only create profile if organization_id is provided
  IF org_id IS NOT NULL THEN
    INSERT INTO public.users (
      id,
      organization_id,
      email,
      first_name,
      last_name,
      role,
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      org_id,
      NEW.email,
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'last_name',
      'employee', -- Default role
      'active',   -- Default status
      NOW(),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO supabase_auth_admin;
GRANT INSERT ON TABLE public.users TO supabase_auth_admin;
