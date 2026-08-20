-- Read-only schema introspection. Run against the PRODUCTION Supabase SQL editor.
-- Writes nothing. Emits one text line per object so the result can be pasted back.
--
-- Purpose: scripts/supabase-schema.sql has drifted behind production, so
-- production is currently the only authoritative record of the schema.

SELECT ddl FROM (
  -- 1. columns
  SELECT
    1 AS sect,
    c.table_name::text AS o1,
    c.ordinal_position::int AS o2,
    format(
      'COL %s.%s %s%s%s%s',
      c.table_name,
      c.column_name,
      c.data_type,
      CASE
        WHEN c.character_maximum_length IS NOT NULL
          THEN '(' || c.character_maximum_length || ')'
        WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL
          THEN '(' || c.numeric_precision || ',' || coalesce(c.numeric_scale, 0) || ')'
        ELSE ''
      END,
      CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
      coalesce(' DEFAULT ' || c.column_default, '')
    ) AS ddl
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'

  UNION ALL

  -- 2. constraints (PK, UNIQUE, FK, CHECK)
  SELECT 2, con.conrelid::regclass::text, 0,
         format('CON %s %s', con.conrelid::regclass, pg_get_constraintdef(con.oid))
  FROM pg_constraint con
  JOIN pg_namespace n ON n.oid = con.connamespace
  WHERE n.nspname = 'public'

  UNION ALL

  -- 3. indexes
  SELECT 3, tablename::text, 0, format('IDX %s', indexdef)
  FROM pg_indexes
  WHERE schemaname = 'public'

  UNION ALL

  -- 4. row-level security state (answers the open RLS question at the same time)
  SELECT 4, cl.relname::text, 0,
         format('RLS %s rls_enabled=%s rls_forced=%s',
                cl.relname, cl.relrowsecurity, cl.relforcerowsecurity)
  FROM pg_class cl
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE n.nspname = 'public' AND cl.relkind = 'r'
) x
ORDER BY sect, o1, o2;
