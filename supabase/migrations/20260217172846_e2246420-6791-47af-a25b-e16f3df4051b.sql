
-- Add user_id column to documents
ALTER TABLE public.documents ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to settings
ALTER TABLE public.settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Make user_id unique on settings (one settings row per user)
ALTER TABLE public.settings ADD CONSTRAINT settings_user_id_unique UNIQUE (user_id);

-- Drop old permissive-for-all policies on documents
DROP POLICY IF EXISTS "Allow public delete documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public insert documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public read documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public update documents" ON public.documents;

-- Drop old policies on settings
DROP POLICY IF EXISTS "Allow public insert settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public update settings" ON public.settings;

-- New RLS policies for documents - users see only their own
CREATE POLICY "Users can view own documents" ON public.documents
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON public.documents
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON public.documents
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON public.documents
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Allow anonymous users to read documents for signing (via unique_id)
CREATE POLICY "Anyone can read documents for signing" ON public.documents
FOR SELECT TO anon USING (true);

-- New RLS policies for settings - users see only their own
CREATE POLICY "Users can read own settings" ON public.settings
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON public.settings
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.settings
FOR UPDATE TO authenticated USING (auth.uid() = user_id);
