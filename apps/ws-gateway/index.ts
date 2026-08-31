import { WebSocketServer } from "ws";
import { createServer } from "http";

import { connectDb } from "@playhive/db";
import { handleConnection } from "./handlers/dispatcher";
import { PORT } from "./utils";

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", handleConnection);

connectDb()
    .then(() => {
        console.log("Connected to database");
        server.listen(PORT, () => {
            console.log(`WS Gateway listening on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Failed to connect to database:", err);
        process.exit(1);
    });
