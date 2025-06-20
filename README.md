# LDES Publisher Service

This microservice allows you to publish additions and modifications to resources to an LDES backend. The `/publish` endpoint of this service can be added to a delta notifier configuration (https://github.com/mu-semtech/delta-notifier). This microservice has been evaluated to work with the `https://github.com/lblod/ldes-producer` NPM library.

The following environment variables can be provided:

- `LDES_FOLDER`: the subfolder to store de LDES streams in.
- `DATA_FOLDER`: the parent folder to store the LDES streams in (default to `/data`).
- `LDES_FRAGMENTER` (optional): the fragmenter which should be applied when adding new resources. For time-based streams, this will typically be `time-fragmenter`.
- `WRITE_INITIAL_STATE`: if set to "true", this writes the current state of the database to the ldes stream as one large page. Default: "false". Writes to `${DATA_FOLDER}/${streamname}/${firstfilebynumericalsort}.ttl` or creates file `1.ttl` if no file exists. Streams are configured in `config/initialization.ts`
- `LDES_BASE`: base url to be used for the LDES stream that is published. Defaults to `http://lmb.lblod.info/streams/ldes`, only used if `WRITE_INITIAL_STATE` is true.
- `MAX_PAGE_SIZE_BYTES`: the maximum size of every initial LDES page file in bytes, defaults to `10000000`. Only used if `WRITE_INITIAL_STATE` is true.
- `INITIAL_STATE_LIMIT`: the limit to use when writing batches to the initial state file. Note: every batch will have its own prefixes, which means prefixes are redefined (allowed by the turtle spec and virtuoso). Default: 10000. Only used if `WRITE_INITIAL_STATE` is true.
- `DIRECT_DB_ENDPOINT`: writing the initial state requires a direct connection to the database (we use ttl directly). This is the url of the database. Default: http://virtuoso:8890/sparql. Only used if `WRITE_INITIAL_STATE` is true.
- `AUTO_HEALING`: whether or not to use the auto-healing functionality for the LDES stream, set to "true" to activate auto healing. defaults to false.
- `CRON_HEALING`: the cron config for how often to trigger auto healing. Defaults to 0 \* \* \* \* (so every hour).
- `HEALING_LIMIT`: number of instances to heal in one iteration of the auto healing. Defaults to 1000. Only used if `AUTO_HEALING` is true.
- `HEALING_DUMP_GRAPH`: the (temporary) graph that is used to receive the raw triples posted on the LDES. Defaults to `http://mu.semte.ch/graphs/ldes-dump`. This graph is cleared every time the healing process is run.
- `HEALING_TRANSFORMED_GRAPH`: the (temporary) graph where the processed LDES data is stored. This holds the latest version of the LDES instances so they can be compared with what is currently in the database. Defaults to `http://mu.semte.ch/graphs/transformed-ldes-data`
- `HEALING_BATCH_SIZE`: the number of triples that are written to the dump graph at a time. Defaults to 100
- `CRON_CHECKPOINT`: the cron config for how often to trigger the creation of a checkpoint. Not set by default so no checkpoints are created.
- `VIRTUOSO_DATE_WORKAROUND`: we noticed that some virtuoso versions have trouble comparing dates, finding differences where the dates are actually the same (with the same datatype). The workaround is to compare the string value of the objects during auto healing instead of the object values themselves. This is obviously bad so don't use it unless you really have to.

## Auto Healing

The LDES delta pusher can fetch its own stream(s) and compare the final result with what is currently in the database. If it discovers changes, it will trigger a new dispatch of the affected instance to the stream.

The stream is read directly from the backend service (using the internal docker compose network) and stored into a temporary graph in the database. The default implementation only looks at the dct:modified time of the instances. The assumption here is that if the modified time is the same, then all other data will also be up to date on the stream. However, by adding other predicates to the `healingPredicates` array in the config, you can have the stream also check for values of other predicates that are not on the LDES stream. Have a look at the example config in `config/healing.ts`, it clarifies the meaning of each value

## Manual trigger of the healing process

The `/manual-healing` endpoint allows for manually triggering the healing process by sending a `POST` request.
To reach the service with `curl`, you will have to expose its ports in the compose config, and curl from the system the stack is running on.

Of course, you can also use the dispatcher for a more robust way, but the need for manually triggering the healing should be rather exceptional.

Note also the process can take quite a long time depending on the size of your database. The endpoint is currently not taskified and will block the request for as long as it's running.


## Checkpoints

Once your LDES has been producing for a while, it can be annoying for clients to have to fetch all changes since the beginning of the stream. They may only be interested in the changes in the last month for instance. Or they may just want to be in sync with the current state of the stream.

For this reason, checkpoints can be created. These checkpoints are separate pages that represent the state of the database starting at the moment that the checkpoint was created and they resemble the pages created during the initialization of the stream. For instance the first page of a checkpoint file starting at 2024-11-15T14-30-35 could be written to `/data/public/checkpoints/2024-11-15T14-30-35/1.ttl`. This page then refers to the next page `/data/public/checkpoints/2024-11-15T14-30-35/2.ttl` like any normal LDES page would. Finally, the last page of the checkpoint refers to the page that was active in the LDES stream at the time the checkpoint was created. This page may contain some redundant information that was already part of the checkpoint, but that's not a problem as the client will discard older information and only keep the latest values anyway. It also means that the client will just continue following the normal LDES stream after the checkpoint was fully processed. In fact, the only thing you need to tell the client is where to find the first page of the LDES stream you want to consume, so the whole idea of checkpoints is transparent to the client. It handles checkpoint pages just like any other page.

To find out which checkpoints are available, the ldes-delta-pusher service offers the `/checkpoints/:stream` endpoint that returns the available checkpoints as linked data (in json-ld, n-quads, n-triples, trig, n3 or turtle). For instance, these triples claim there is a checkpoint `public/checkpoints/2024-11-15T14-30-35/1` that starts at `2024-11-15T14:31:51.491Z`

```
<http://ldes-backend/public> <http://mu.semte.ch/vocabularies/ext/ldesCheckpoint> <http://ldes-backend/public/checkpoints/2024-11-15T14-30-35/1>.
<http://ldes-backend/public/checkpoints/2024-11-15T14-30-35/1> <http://purl.org/dc/terms/modified> "2024-11-15T14:31:51.491Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>.
```

Checkpoints can be created by specifying a value for the `CRON_CHECKPOINT` environment variable in the form of a normal cron time string.

## Auto Healing and Checkpoints

When using checkpoints and checkpoints together, the auto healing will notice that checkpoints are available and restore the LDES stream starting from the last checkpoint if it is older than two days. That way, changes that may not have been healed before the creation of the last checkpoint will still be healed in the LDES stream.
