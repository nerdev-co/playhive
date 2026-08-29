import { WebSocketServer } from "ws";
import { createServer } from "http";

import { handleConnection } from "./handlers/dispatcher";
import { PORT } from "./utils";

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", handleConnection);

server.listen(PORT, () => {
    console.log(`WS Gateway listening on port ${PORT}`);
});
