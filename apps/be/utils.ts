import type { ErrorCode } from "@playhive/protocol";

export function createResponse<T>(data: T, status = 200, extra?: Record<string, string>): Response {
    return Response.json(data, {
        status,
        headers: { ...corsHeaders(), ...extra },
    });
}

export function createError(message: string, status = 400, code?: ErrorCode, extra?: Record<string, string>): Response {
    const body: Record<string, unknown> = { error: message };
    if (code) body.code = code;
    return Response.json(body, { status, headers: { ...corsHeaders(), ...extra } });
}

export function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}

export function handleOptions(request: Request): Response | null {
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
    }
    return null;
}
