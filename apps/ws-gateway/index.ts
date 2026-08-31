import { WebSocketServer } from "ws";
import { createServer } from "http";

import { connectDb } from "@playhive/db";
import { handleConnection } from "./handlers/dispatcher";
import { PORT } from "./utils";
import { createLogger } from "./logger";

const log = createLogger("ws-gw");

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", handleConnection);

connectDb()
    .then(() => {
        log.info("Connected to database");
        server.listen(PORT, () => {
            log.info(`WS Gateway listening on port ${PORT}`);
        });
    })
    .catch((err) => {
        log.error("Failed to connect to database", { error: err instanceof Error ? err.message : String(err) });
        process.exit(1);
    });
