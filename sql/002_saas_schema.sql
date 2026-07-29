-- =====================================================
-- MIGRAÇÃO 002 — Estrutura SaaS / Multi-tenant
-- Execute no SQL Editor do Supabase
-- =====================================================

-- 1. Tabela de planos
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,          -- 'free', 'pro'
    name TEXT NOT NULL,
    max_sites INT NOT NULL DEFAULT 1,
    max_visits_month INT NOT NULL DEFAULT 10000,
    history_days INT NOT NULL DEFAULT 30,
    can_export BOOLEAN NOT NULL DEFAULT FALSE,
    can_realtime BOOLEAN NOT NULL DEFAULT FALSE,
    price_brl NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.plans (id, name, max_sites, max_visits_month, history_days, can_export, can_realtime, price_brl)
VALUES
    ('free', 'Gratuito',   1,  10000,  30, FALSE, FALSE, 0),
    ('pro',  'Pro',       10, 500000, 365, TRUE,  TRUE,  49.90)
ON CONFLICT (id) DO NOTHING;

-- 2. Tabela de perfis de usuário (espelha auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    plan_id TEXT NOT NULL DEFAULT 'free' REFERENCES public.plans(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cria o perfil automaticamente quando um usuário se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, plan_id)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'name',
        'free'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Tabela de sites monitorados
CREATE TABLE IF NOT EXISTS public.sites (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,              -- nome amigável: "Meu Blog"
    domain TEXT NOT NULL,            -- domínio: "meublog.com.br"
    token TEXT UNIQUE NOT NULL,      -- token único pro script de rastreamento
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Adiciona user_id e site_id na tabela visits (se ainda não existirem)
ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS site_id INT REFERENCES public.sites(id);

-- 5. Índices de performance
CREATE INDEX IF NOT EXISTS idx_visits_user_id     ON public.visits(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_site_id     ON public.visits(site_id);
CREATE INDEX IF NOT EXISTS idx_visits_created_at  ON public.visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_host        ON public.visits(host);
CREATE INDEX IF NOT EXISTS idx_sites_user_id      ON public.sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_token        ON public.sites(token);

-- 6. RLS — Row Level Security
-- Usuários só podem ver os próprios dados

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfil próprio" ON public.profiles
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "sites próprios" ON public.sites
    FOR ALL USING (auth.uid() = user_id);

-- visits: leitura filtrada por user_id
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visitas próprias" ON public.visits
    FOR SELECT USING (auth.uid() = user_id);

-- O backend usa service_role e ignora RLS — isso é intencional.
-- O RLS protege acessos diretos via API do Supabase no frontend.
