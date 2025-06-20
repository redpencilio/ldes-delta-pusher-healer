import { querySudo } from "@lblod/mu-auth-sudo";
import { CronJob } from "cron";
import { text } from "node:stream/consumers";
import { healEntities } from "./heal-ldes-data";
import {
  clearHealingTempGraphs,
  insertLdesPageToDumpGraph,
  deleteDuplicatesForValues,
} from "./upload-entities-to-db";
import { transformLdesDataToEntities } from "./transform-ldes-data-to-entities";
import { CRON_HEALING, DATA_FOLDER } from "../environment";
import { HealingConfig, getHealingConfig } from "../config/config";
import { ttlFileAsString } from "../util/ttlFileAsContentType";

import { getNode, getConfigFromEnv } from "@lblod/ldes-producer";
const ldesProducerConfig = getConfigFromEnv();
type PagePointer = { path: string; file: number };

let isRunning = false;
const triggerHealing = async (startMessage: string) => {
  console.log(startMessage);

  if (isRunning) {
    return;
  }
  isRunning = true;
  const config = await getHealingConfig();
  console.log(`Healing config: ${JSON.stringify(config)}`);

  for (const stream of Object.keys(config)) {
    await healStream(stream, config);
  }
  isRunning = false;
};
const cronMethod = async () =>
  triggerHealing(`
    *******************************************************************
    *** Pull LDES triggered by cron job at ${new Date().toISOString()} ***
    *******************************************************************`);
export const manualTrigger = async () =>
  triggerHealing(`
    *******************************************************************
    *** Pull LDES triggered by manual trigger at ${new Date().toISOString()} ***
    *******************************************************************`);

async function healStream(stream: string, config: HealingConfig) {
  const startTime = performance.now();

  await clearHealingTempGraphs();
  await loadStreamIntoDumpGraph(stream);
  console.log(
    `Loading LDES into dump graph took ${performance.now() - startTime} ms`
  );
  await transformLdesDataToEntities();
  await healEntities(stream, config);
  console.log(`Healing the LDES took ${performance.now() - startTime} ms`);
}

async function loadStreamIntoDumpGraph(stream: string): Promise<void> {
  let isLdesInsertedInDatabase = false;
  let currentPage: PagePointer | null = await determineFirstPageOrCheckpoint(
    stream
  );
  while (!isLdesInsertedInDatabase && currentPage) {
    const turtleText = await fetchPage(currentPage.path, currentPage.file);
    if (turtleText) {
      const lastBatchEntities = await insertLdesPageToDumpGraph(turtleText);
      await deleteDuplicatesForValues(lastBatchEntities);
    } else {
      isLdesInsertedInDatabase = true;
    }
    currentPage = await determineNextPage(stream, currentPage);
  }
  await deleteDuplicatesForValues();
}

async function fetchPage(stream: string, page: number): Promise<string | null> {
  console.log(`Loading LDES [${stream}] page ${page}`);
  try {
    const response = await getNode(ldesProducerConfig, {
      folder: stream,
      contentType: "text/turtle",
      nodeId: page,
    });
    return await text(response.stream);
  } catch (e) {
    if (e.status === 404) {
      console.log(
        `Page ${page} not found, assuming it's the last page of the stream`
      );
      return null;
    }
    throw new Error(
      `Failed to fetch LDES page from stream ${stream}, error: ${e}`
    );
  }
}
async function determineFirstPageOrCheckpoint(
  stream: string
): Promise<PagePointer> {
  try {
    console.log(`Fetching checkpoints for stream ${stream}`);
    const fileString = await ttlFileAsString(
      `${DATA_FOLDER}/${stream}/checkpoints.ttl`,
      "application/ld+json"
    );
    const modified = "http://purl.org/dc/terms/modified";
    const twoDaysAgo = new Date().getTime() - 1000 * 60 * 60 * 48;
    // only keep checkpoints that are older than two days so we are
    // reasonably sure the healing has taken effect in the main stream
    const checkpoints = JSON.parse(fileString).filter((i) => {
      return (
        i[modified] && new Date(i[modified][0]["@value"]).getTime() < twoDaysAgo
      );
    });
    checkpoints.sort((a: any, b: any) =>
      a[modified][0].value < b[modified][0].value ? 1 : -1
    );
    const checkpointName = checkpoints[0]["@id"].split("checkpoints/")[1];
    const checkpointFolderName = checkpointName.split("/")[0];
    return { path: `${stream}/checkpoints/${checkpointFolderName}`, file: 1 };
  } catch (e) {
    return { path: `${stream}`, file: 1 };
  }
}

async function determineNextPage(
  stream: string,
  currentPage: PagePointer
): Promise<PagePointer | null> {
  const pathWithoutEndSlash = currentPage.path.endsWith("/")
    ? currentPage.path.slice(0, -1)
    : currentPage.path;
  const query = `
    SELECT ?page WHERE {
      ?oldPage <https://w3id.org/tree#relation> ?relation .
      ?relation a <https://w3id.org/tree#GreaterThanOrEqualToRelation> .
      ?relation <https://w3id.org/tree#value> ?date .
      ?relation <https://w3id.org/tree#node> ?page .
      FILTER(STRENDS(STR(?oldPage), "${pathWithoutEndSlash}/${currentPage.file}"))
    } LIMIT 1
  `;
  const result = await querySudo(query);
  console.log(
    `Next page query result: ${JSON.stringify(
      result.results.bindings[0]?.page?.value
    )}`
  );
  if (result.results.bindings.length === 0) {
    return null;
  }
  const page = result.results.bindings[0].page.value;
  const safePartOfPageUrl = page.split(`/${stream}/`)[1];
  const splitSafePart = safePartOfPageUrl.split("/");
  const tail = splitSafePart[splitSafePart.length - 1];
  const head = splitSafePart.slice(0, splitSafePart.length - 1).join("/");
  return {
    path: `${stream}/${head}`,
    file: parseInt(tail),
  };
}

export const cronjob = CronJob.from({
  cronTime: CRON_HEALING,
  onTick: cronMethod,
});
