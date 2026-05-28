-- RPC para scripts RPA que cargan credenciales CHESS sin pegar SQL manual.
CREATE OR REPLACE FUNCTION public.guardar_secreto_vault(secret_name text, secret_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  sid uuid;
BEGIN
  IF secret_name IS NULL OR btrim(secret_name) = '' THEN
    RAISE EXCEPTION 'secret_name vacío';
  END IF;
  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'secret_value nulo';
  END IF;

  SELECT id INTO sid
  FROM vault.secrets
  WHERE name = secret_name
  LIMIT 1;

  IF sid IS NOT NULL THEN
    PERFORM vault.update_secret(sid, secret_value, secret_name, secret_name);
  ELSE
    PERFORM vault.create_secret(secret_value, secret_name, secret_name);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_secreto_vault(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_secreto_vault(text, text) TO service_role;
