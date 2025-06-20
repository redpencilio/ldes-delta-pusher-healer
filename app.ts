import bodyParser from "body-parser";
import type { Request, Response } from "express";
//@ts-ignore
import { app, errorHandler } from "mu";

import { cronjob as autoHealing, manualTrigger } from "./self-healing/cron";
import { STARTUP_TIMEOUT } from "./environment";

/**
 * A manual trigger of the auto-healing process. Runs even if the AUTO_HEALING
 * variable is false, for one-off occasions.
 */
app.post("/manual-healing", async function (_req: Request, res: Response) {
  try {
    await manualTrigger();
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
  res
    .status(200)
    .send(`Healing succesfully completed at ${new Date().toISOString()}`);
});

async function run() {
  await new Promise((resolve) => setTimeout(resolve, STARTUP_TIMEOUT));
  autoHealing.start();
}

run();

app.use(errorHandler);
