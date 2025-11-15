// Deno global type declarations for Supabase Edge Functions
// Note: Deno types are provided by deno.ns lib in deno.json

// Extend ImportMeta to include 'main' property for Deno
interface ImportMeta {
  main: boolean;
}
