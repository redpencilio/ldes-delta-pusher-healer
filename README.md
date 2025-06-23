# LDES Publisher Healer

This is the healer component of the LDES delta pusher (https://github.com/redpencilio/ldes-delta-pusher-service). It runs as a separate service next to the ldes-delta pusher so that the complexity of healing the LDES stream can be kept out of the core repository.

The following environment variables can be provided:

- `LDES_FOLDER`: the subfolder to store de LDES streams in.
- `DATA_FOLDER`: the parent folder to store the LDES streams in (default to `/data`).
- `LDES_BASE`: base url to be used for the LDES stream that is published. Defaults to `http://lmb.lblod.info/streams/ldes`.
- `DIRECT_DB_ENDPOINT`: writing the initial state requires a direct connection to the database (we use ttl directly). This is the url of the database. Default: http://virtuoso:8890/sparql. Only used if `WRITE_INITIAL_STATE` is true.
- `AUTO_HEALING`: whether or not to use the auto-healing functionality for the LDES stream, set to "true" to activate auto healing. defaults to false.
- `CRON_HEALING`: the cron config for how often to trigger auto healing. Defaults to 0 \* \* \* \* (so every hour).
- `HEALING_LIMIT`: number of instances to heal in one iteration of the auto healing. Defaults to 1000. Only used if `AUTO_HEALING` is true.
- `HEALING_DUMP_GRAPH`: the (temporary) graph that is used to receive the raw triples posted on the LDES. Defaults to `http://mu.semte.ch/graphs/ldes-dump`. This graph is cleared every time the healing process is run.
- `HEALING_FLAG_GRAPH`: the graph where subjects are flagged for healing with a timestamp at which healing should be triggered. This is mostly done so a delta is produced for the ldes-delta-pusher so it can put the instance on the LDES again, but it could in theory be picked up by another service. Defaults to `http://mu.semte.ch/graphs/ldes-healing-flags`. At most one timestamp will be be set per instance in this graph.
- `HEALING_TRANSFORMED_GRAPH`: the (temporary) graph where the processed LDES data is stored. This holds the latest version of the LDES instances so they can be compared with what is currently in the database. Defaults to `http://mu.semte.ch/graphs/transformed-ldes-data`
- `HEALING_BATCH_SIZE`: the number of triples that are written to the dump graph at a time. Defaults to 100
- `VIRTUOSO_DATE_WORKAROUND`: we noticed that some virtuoso versions have trouble comparing dates, finding differences where the dates are actually the same (with the same datatype). The workaround is to compare the string value of the objects during auto healing instead of the object values themselves. This is obviously bad so don't use it unless you really have to.

## Auto Healing

The LDES delta pusher can fetch its own stream(s) and compare the final result with what is currently in the database. If it discovers changes, it will trigger a new dispatch of the affected instance to the stream.

The stream is read directly from the backend service (using the internal docker compose network) and stored into a temporary graph in the database. The default implementation only looks at the dct:modified time of the instances. The assumption here is that if the modified time is the same, then all other data will also be up to date on the stream. However, by adding other predicates to the `healingPredicates` array in the config, you can have the stream also check for values of other predicates that are not on the LDES stream. Have a look at the example config in `config/healing.ts`, it clarifies the meaning of each value

## Manual trigger of the healing process

The `/manual-healing` endpoint allows for manually triggering the healing process by sending a `POST` request.
To reach the service with `curl`, you will have to expose its ports in the compose config, and curl from the system the stack is running on.

Of course, you can also use the dispatcher for a more robust way, but the need for manually triggering the healing should be rather exceptional.

Note also the process can take quite a long time depending on the size of your database. The endpoint is currently not taskified and will block the request for as long as it's running.

## Auto Healing and Checkpoints

When using checkpoints and checkpoints together, the auto healing will notice that checkpoints are available and restore the LDES stream starting from the last checkpoint if it is older than two days. That way, changes that may not have been healed before the creation of the last checkpoint will still be healed in the LDES stream.
