import { querySudo, updateSudo } from "@lblod/mu-auth-sudo";
import { sparqlEscapeUri, sparqlEscapeDateTime } from "mu";
import {
  HEALING_DUMP_GRAPH,
  HEALING_TRANSFORMED_GRAPH,
  DIRECT_DB_ENDPOINT,
  HEALING_LIMIT,
  HEALING_FLAG_GRAPH,
  HEALING_BATCH_SIZE,
} from "../environment";
import { HealingConfig } from "../config/config";

export async function healEntities(
  stream: string,
  config: HealingConfig
): Promise<void> {
  const rdfTypes = Object.keys(config[stream].entities);
  for (const type of rdfTypes) {
    await erectMissingTombstones(type, stream, config);
    const differences = await getDifferences(type, stream, config);
    await markForHealing(differences);
  }
}

async function markForHealing(differences) {
  const uniqueSubjects = [
    ...new Set<string>(differences.map((difference) => difference.s.value)),
  ];
  if (uniqueSubjects.length === 0) {
    console.log("No differences found.");
    return;
  }

  while (uniqueSubjects.length > 0) {
    const batch = uniqueSubjects.splice(0, HEALING_BATCH_SIZE);
    const safeValues = batch.map((i) => sparqlEscapeUri(i)).join("\n");
    const update = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE {
      GRAPH ${sparqlEscapeUri(HEALING_FLAG_GRAPH)} {
        ?s ext:markedForLDESHealingAt ?oldTimestamp .
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(HEALING_FLAG_GRAPH)} {
        ?s ext:markedForLDESHealingAt ?newTimestamp .
      }
    }
    WHERE {
      VALUES ?s {
        ${safeValues}
      }
      ?s a ?thing .
      OPTIONAL {
        GRAPH ${sparqlEscapeUri(HEALING_FLAG_GRAPH)} {
          ?s ext:markedForLDESHealingAt ?oldTimestamp .
        }
      }
      BIND(NOW() AS ?newTimestamp)
    }
  `;

    await updateSudo(update);
  }
}

async function getDifferences(
  type: string,
  stream: string,
  config: HealingConfig
) {
  const predicates =
    config[stream].entities[type].healingPredicates ||
    config[stream].entities[type];
  const predicateValues = predicates
    .map((p: string) => sparqlEscapeUri(p))
    .join("\n");
  const filter = config[stream].entities[type].instanceFilter || "";

  const excludedGraphs = config[stream].graphsToExclude || [];
  excludedGraphs.push(HEALING_DUMP_GRAPH);
  excludedGraphs.push(HEALING_TRANSFORMED_GRAPH);
  const graphFilter = config[stream].graphFilter || "";
  const excludeGraphs = excludedGraphs
    .map((graph: string) => sparqlEscapeUri(graph))
    .join(", ");

  const graphTypesToExclude = (config[stream].graphTypesToExclude || [])
    .map((graph: string) => sparqlEscapeUri(graph))
    .join("\n");

  const healingFilter = config[stream].entities[type].healingFilter || "";

  const missingLdesValues = await getMissingValuesLdes({
    type,
    predicateValues,
    filter,
    graphFilter,
    graphTypesToExclude,
    excludeGraphs,
    healingFilter,
  });
  // only looking for missing values on the ldes, excess values bring hard challenges like how did they even get here? should we purge them or is a tombstone enough? were they just not filtered out correctly?
  console.log(
    `Found ${missingLdesValues.length} missing values: ${JSON.stringify(
      missingLdesValues
    )}`
  );
  return missingLdesValues;
}

async function getMissingValuesLdes(options: {
  type: string;
  predicateValues: string;
  filter: string;
  graphFilter: string;
  graphTypesToExclude: string;
  excludeGraphs: string;
  healingFilter: string;
}) {
  const {
    graphTypesToExclude,
    predicateValues,
    filter,
    type,
    excludeGraphs,
    healingFilter,
  } = options;
  let graphFilter = options.graphFilter || "";
  // legacy options, graph filter is much more powerful
  if (graphTypesToExclude) {
    graphFilter += `
    VALUES ?excludeGraphType { ${graphTypesToExclude} }
    FILTER NOT EXISTS {
      ?g a ?excludeGraphType.
    }`;
  }
  if (excludeGraphs) {
    graphFilter += `
    FILTER(?g NOT IN (${excludeGraphs}))`;
  }

  let healingQuery = `
    SELECT DISTINCT ?s ?p ?o
    WHERE {
      VALUES ?p { ${predicateValues} }

      GRAPH ?g {
        ?s a ${sparqlEscapeUri(type)}.
        ?s ?p ?o.
      }
      ${filter}

      ${graphFilter}

      FILTER NOT EXISTS {
        GRAPH ${sparqlEscapeUri(HEALING_TRANSFORMED_GRAPH)} {
          ?s ?p ?o.
        }
      }
      ${healingFilter}
    } LIMIT ${HEALING_LIMIT}
  `;

  if (process.env.VIRTUOSO_DATE_WORKAROUND === "true") {
    healingQuery = `
    SELECT DISTINCT ?s ?p ?o
    WHERE {
      VALUES ?p { ${predicateValues} }

      GRAPH ?g {
        ?s a ${sparqlEscapeUri(type)}.
        ?s ?p ?o.

      }

      ${filter}
      ${graphFilter}

      FILTER NOT EXISTS {
        GRAPH ${sparqlEscapeUri(HEALING_TRANSFORMED_GRAPH)} {
          ?s ?p ?o2.
          FILTER(STR(?o) = STR(?o2))
        }
      }
      ${healingFilter}
    } LIMIT ${HEALING_LIMIT}
  `;
  }

  const result = await querySudo(
    healingQuery,
    {},
    { sparqlEndpoint: DIRECT_DB_ENDPOINT }
  );
  return result.results.bindings.map((binding) => binding);
}

async function erectMissingTombstones(
  type: string,
  stream: string,
  config: HealingConfig
) {
  const graphTypesToExclude = config[stream].graphTypesToExclude;
  let graphFilter = config[stream].graphFilter || "";
  const excludedGraphs = config[stream].graphsToExclude;
  if (excludedGraphs?.length > 0) {
    const toExclude = excludedGraphs
      .map((graph: string) => sparqlEscapeUri(graph))
      .join(", ");
    graphFilter += `FILTER(?g NOT IN (${toExclude}))`;
  }
  let excludeGraphTypeValues = "";
  if (graphTypesToExclude?.length > 0) {
    excludeGraphTypeValues = graphTypesToExclude
      .map((type: string) => sparqlEscapeUri(type))
      .join("\n ");
    excludeGraphTypeValues = `VALUES ?excludeGraphType { ${excludeGraphTypeValues} }`;
    graphFilter += `FILTER NOT EXISTS {
      ?g a ?excludedGraphType.
    }`;
  }

  const where = `
      GRAPH ${sparqlEscapeUri(HEALING_TRANSFORMED_GRAPH)} {
        ?s a ${sparqlEscapeUri(type)}.
      }
      FILTER NOT EXISTS {
        ${excludeGraphTypeValues}
        GRAPH ?g {
          VALUES ?type {
            ${sparqlEscapeUri(type)}
            <http://www.w3.org/ns/activitystreams#Tombstone>
          }
          ?s a ?type.
        }

        ${graphFilter}
      }`;

  const count = await querySudo(`
    SELECT (COUNT(DISTINCT ?s) as ?count)
    WHERE {
      ${where}
    }
  `);
  if (parseInt(count.results.bindings[0]?.count?.value || "0") < 1) {
    console.log(`No missing tombstones to erect for ${type}`);
    return;
  }
  console.log(
    `Found ${count.results.bindings[0].count.value} missing tombstones for ${type}. Erecting...`
  );

  // we're putting the tombstones into the public graph. we don't know the graph they should have been put in
  // and this is the best we can to to heal
  await updateSudo(`
    PREFIX astreams: <http://www.w3.org/ns/activitystreams#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX dct: <http://purl.org/dc/terms/>
    INSERT {
      GRAPH <http://mu.semte.ch/graphs/public> {
        ?s a astreams:Tombstone ;
           astreams:deleted ${sparqlEscapeDateTime(new Date())} ;
           dct:modified ${sparqlEscapeDateTime(new Date())} ;
           astreams:formerType ${sparqlEscapeUri(type)} .
      }
    }
    WHERE {
      ${where}
    }
  `);
}
