// ---------------------------------------------------------------------------
// CORS helper — allow the GitHub Pages origin and localhost for dev
// ---------------------------------------------------------------------------
export function corsHeaders(origin: string | null): Record<string, string> {
    const allowed = [
        "https://wincisky.github.io",
    ];
    // Allow any localhost origin for local development
    const isLocalhost = origin != null && /^http:\/\/localhost(:\d+)?$/.test(origin);
    const allowedOrigin = (origin && allowed.includes(origin)) || isLocalhost
        ? origin
        : allowed[0];

    return {
        "Access-Control-Allow-Origin": allowedOrigin!,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}