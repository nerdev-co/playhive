import { createResponse } from "../utils";

export function handleHealth(): Response {
    return createResponse({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
}
