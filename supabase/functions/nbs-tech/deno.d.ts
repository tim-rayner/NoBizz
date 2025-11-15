// Deno global type declarations for Supabase Edge Functions
declare namespace Deno {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
  
  export namespace env {
    export function get(key: string): string | undefined;
    export function set(key: string, value: string): void;
  }
}

