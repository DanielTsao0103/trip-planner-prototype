/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_GOOGLE_MAP_ID?: string;
  readonly VITE_BOOKINGS_INBOX_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
