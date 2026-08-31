export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = (process.env.WS_LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function formatMsg(level: LogLevel, scope: string, msg: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase().padEnd(5)}] [${scope}] ${msg}`;
  if (data && Object.keys(data).length > 0) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export function createLogger(scope: string) {
  return {
    debug(msg: string, data?: Record<string, unknown>) {
      if (shouldLog("debug")) console.debug(formatMsg("debug", scope, msg, data));
    },
    info(msg: string, data?: Record<string, unknown>) {
      if (shouldLog("info")) console.log(formatMsg("info", scope, msg, data));
    },
    warn(msg: string, data?: Record<string, unknown>) {
      if (shouldLog("warn")) console.warn(formatMsg("warn", scope, msg, data));
    },
    error(msg: string, data?: Record<string, unknown>) {
      if (shouldLog("error")) console.error(formatMsg("error", scope, msg, data));
    },
  };
}
