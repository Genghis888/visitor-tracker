import { createClient } from "@supabase/supabase-js";

// Cliente com service_role — uso exclusivo do backend.
// NUNCA exponha a service_role key no frontend.
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Cliente com anon key — mesmas permissões que o frontend teria.
// Usado para verificar tokens JWT vindos do cliente.
const supabaseAnon = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export { supabaseAdmin, supabaseAnon };
