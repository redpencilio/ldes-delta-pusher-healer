export const DATA_FOLDER = process.env.DATA_FOLDER || ("/data" as string);
export const AUTO_HEALING = process.env.AUTO_HEALING ?? false;
export const CRON_HEALING = process.env.CRON_HEALING ?? "0 * * * *"; // Every hour
export const STARTUP_TIMEOUT = parseInt(process.env.STARTUP_TIMEOUT || "20000");
export const HEALING_LIMIT = process.env.HEALING_LIMIT || 3000;
export const HEALING_BATCH_SIZE = parseInt(
  process.env.HEALING_BATCH_SIZE ?? "100"
);
export const HEALING_DUMP_GRAPH =
  process.env.HEALING_DUMP_GRAPH ?? "http://mu.semte.ch/graphs/ldes-dump";
export const HEALING_TRANSFORMED_GRAPH =
  process.env.HEALING_TRANSFORMED_GRAPH ??
  "http://mu.semte.ch/graphs/transformed-ldes-data";
export const DIRECT_DB_ENDPOINT =
  process.env.DIRECT_DB_ENDPOINT || "http://virtuoso:8890/sparql";
export const LDES_DELTA_ENDPOINT =
  process.env.LDES_DELTA_ENDPOINT || `http://ldes-delta-pusher/publish`;

const config = {
  AUTO_HEALING,
  CRON_HEALING,
  DATA_FOLDER,
  DIRECT_DB_ENDPOINT,
  HEALING_BATCH_SIZE,
  HEALING_DUMP_GRAPH,
  HEALING_LIMIT,
  LDES_DELTA_ENDPOINT,
  STARTUP_TIMEOUT,
};

console.log("\n Configuration:", JSON.stringify(config, null, 2));
