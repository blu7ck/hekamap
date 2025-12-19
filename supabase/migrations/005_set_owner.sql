-- Set initial owner role by email (idempotent)
DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'iletisim@hekamap.com';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Owner email % not found in auth.users; skipping role assignment', v_email;
    RETURN;
  END IF;

  INSERT INTO public.user_profiles (id, role, created_at, updated_at)
  VALUES (v_user_id, 'owner', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET role = 'owner',
        updated_at = NOW();

  RAISE NOTICE 'Owner role set for user %', v_email;
END;
$$;


