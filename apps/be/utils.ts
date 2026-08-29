export function createResponse<T>(data: T, status = 200): Response {
    return Response.json(data, { status });
}

export function createError(message: string, status = 400): Response {
    return Response.json({ error: message }, { status });
}

export function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}

export function handleOptions(request: Request): Response | null {
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
    }
    return null;
}
