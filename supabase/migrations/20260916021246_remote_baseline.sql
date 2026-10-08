


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."g20_economic_data" (
    "country_iso3" "text" NOT NULL,
    "indicator_key" "text" NOT NULL,
    "year" integer NOT NULL,
    "value" double precision NOT NULL,
    "source" "text" DEFAULT 'worldbank'::"text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."g20_economic_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."g20_indicators" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "unit" "text",
    "description" "text",
    "source_name" "text",
    "source_code" "text",
    "source_url" "text",
    "coverage_note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."g20_indicators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."g20_quarterly_data" (
    "country_iso3" "text" NOT NULL,
    "indicator_key" "text" NOT NULL,
    "period" "text" NOT NULL,
    "value" double precision NOT NULL,
    "source" "text" DEFAULT 'oecd'::"text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."g20_quarterly_data" OWNER TO "postgres";


ALTER TABLE ONLY "public"."g20_economic_data"
    ADD CONSTRAINT "g20_economic_data_pkey" PRIMARY KEY ("country_iso3", "indicator_key", "year");



ALTER TABLE ONLY "public"."g20_indicators"
    ADD CONSTRAINT "g20_indicators_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."g20_quarterly_data"
    ADD CONSTRAINT "g20_quarterly_data_pkey" PRIMARY KEY ("country_iso3", "indicator_key", "period");



CREATE INDEX "idx_g20_country" ON "public"."g20_economic_data" USING "btree" ("country_iso3");



CREATE INDEX "idx_g20_indicator" ON "public"."g20_economic_data" USING "btree" ("indicator_key");



CREATE INDEX "idx_g20_year" ON "public"."g20_economic_data" USING "btree" ("year");



CREATE INDEX "idx_g20q_country" ON "public"."g20_quarterly_data" USING "btree" ("country_iso3");



CREATE INDEX "idx_g20q_indicator" ON "public"."g20_quarterly_data" USING "btree" ("indicator_key");



CREATE INDEX "idx_g20q_period" ON "public"."g20_quarterly_data" USING "btree" ("period");



CREATE POLICY "Public read" ON "public"."g20_economic_data" FOR SELECT USING (true);



CREATE POLICY "Public read" ON "public"."g20_indicators" FOR SELECT USING (true);



CREATE POLICY "Public read" ON "public"."g20_quarterly_data" FOR SELECT USING (true);



CREATE POLICY "Public upsert" ON "public"."g20_economic_data" FOR UPDATE USING (true);



CREATE POLICY "Public upsert" ON "public"."g20_indicators" FOR UPDATE USING (true);



CREATE POLICY "Public upsert" ON "public"."g20_quarterly_data" FOR UPDATE USING (true);



CREATE POLICY "Public write" ON "public"."g20_economic_data" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public write" ON "public"."g20_indicators" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public write" ON "public"."g20_quarterly_data" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."g20_economic_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."g20_indicators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."g20_quarterly_data" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."g20_economic_data" TO "anon";
GRANT ALL ON TABLE "public"."g20_economic_data" TO "authenticated";
GRANT ALL ON TABLE "public"."g20_economic_data" TO "service_role";



GRANT ALL ON TABLE "public"."g20_indicators" TO "anon";
GRANT ALL ON TABLE "public"."g20_indicators" TO "authenticated";
GRANT ALL ON TABLE "public"."g20_indicators" TO "service_role";



GRANT ALL ON TABLE "public"."g20_quarterly_data" TO "anon";
GRANT ALL ON TABLE "public"."g20_quarterly_data" TO "authenticated";
GRANT ALL ON TABLE "public"."g20_quarterly_data" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







