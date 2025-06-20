import { updateSudo } from "@lblod/mu-auth-sudo";
import { sparqlEscapeUri, sparqlEscapeString, sparqlEscape } from "mu";
import ForkingStore from "forking-store";
import { NamedNode } from "rdflib";

import {
  HEALING_BATCH_SIZE,
  HEALING_DUMP_GRAPH,
  HEALING_TRANSFORMED_GRAPH,
} from "../environment";
import { DIRECT_DB_ENDPOINT } from "../environment";

export async function clearHealingTempGraphs(): Promise<void> {
  await updateSudo(
    `DROP SILENT GRAPH <${HEALING_DUMP_GRAPH}>`,
    {},
    {
      sparqlEndpoint: DIRECT_DB_ENDPOINT,
    }
  );
  await updateSudo(
    `DROP SILENT GRAPH <${HEALING_TRANSFORMED_GRAPH}>`,
    {},
    {
      sparqlEndpoint: DIRECT_DB_ENDPOINT,
    }
  );
}

export async function insertLdesPageToDumpGraph(
  turtleText: string
): Promise<string[]> {
  const tripleStore = new ForkingStore();
  const graph = new NamedNode("http://data.lblod.info/triples");
  tripleStore.parse(turtleText, graph, "text/turtle");
  const statements = [...tripleStore.graph.statements];
  const tripleCount = statements.length;
  let batch: any[] = [];
  for (let index = 0; index < tripleCount; index += HEALING_BATCH_SIZE) {
    batch = statements.splice(0, HEALING_BATCH_SIZE);
    if (batch.length === 0) {
      continue;
    }
    await addTriplesToLDesDumpGraph(mapStatementsToTriple(batch).join("\n"));
  }
  const lastBatchEntities = batch
    .filter((statement) => {
      return (
        statement.predicate.value === "http://purl.org/dc/terms/isVersionOf"
      );
    })
    .map((statement) => {
      return statement.object.value;
    });
  return lastBatchEntities;
}

let valuesToDelete: Set<string> = new Set();
export async function deleteDuplicatesForValues(values?: string[]) {
  // keeps the list of values to delete in memory until it becomes large enough. Then purge.
  // if values is undefined, purge now.

  valuesToDelete = new Set([...valuesToDelete, ...(values || [])]);
  if (valuesToDelete.size <= 1000 && values) {
    return;
  }
  if (valuesToDelete.size === 0) {
    return; // nothing to delete even if forced to can't do anything
  }

  // using ldesstream2 in case the stream name changed
  // we're sure to still be following the same stream because
  // the dump graph is cleared at the start
  await updateSudo(
    `
    PREFIX tree: <https://w3id.org/tree#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT {
      GRAPH ${sparqlEscapeUri(HEALING_DUMP_GRAPH)} {
        ?toDelete ext:willDelete true.
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(HEALING_DUMP_GRAPH)} {
        VALUES ?entity {
          ${[...valuesToDelete]
            .map((value) => sparqlEscapeUri(value))
            .join("\n")}
        }
        ?toDelete dct:isVersionOf ?entity;
                  prov:generatedAtTime ?time.

        ?ldesEntityTwo dct:isVersionOf ?entity;
                       prov:generatedAtTime ?otherTime.

        FILTER(?ldesEntityTwo != ?toDelete)

        FILTER( ?otherTime > ?time )
      }
    }
  `,
    {},
    { sparqlEndpoint: DIRECT_DB_ENDPOINT }
  );

  await updateSudo(
    `
    PREFIX tree: <https://w3id.org/tree#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE {
      GRAPH ${sparqlEscapeUri(HEALING_DUMP_GRAPH)} {
        ?ldesStream tree:member ?toDelete.
        ?toDelete ?p ?o.
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(HEALING_DUMP_GRAPH)} {
        ?toDelete ext:willDelete true.
        ?toDelete ?p ?o.
      }
    }`,
    {},
    { sparqlEndpoint: DIRECT_DB_ENDPOINT }
  );

  valuesToDelete = new Set();
}

function mapStatementsToTriple(statements: any[]) {
  return statements.map((st) => {
    const object = formatValueForTermType(st.object);

    return `${sparqlEscapeUri(st.subject.value)} ${sparqlEscapeUri(
      st.predicate.value
    )} ${object} .`;
  });
}

const datatypeNames = {
  "http://www.w3.org/2001/XMLSchema#dateTime": "dateTime",
  "http://www.w3.org/2001/XMLSchema#datetime": "dateTime",
  "http://www.w3.org/2001/XMLSchema#date": "date",
  "http://www.w3.org/2001/XMLSchema#decimal": "decimal",
  "http://www.w3.org/2001/XMLSchema#integer": "int",
  "http://www.w3.org/2001/XMLSchema#float": "float",
  "http://www.w3.org/2001/XMLSchema#boolean": "bool",
};

function formatValueForTermType(object) {
  if (object.termType === "NamedNode") {
    return sparqlEscapeUri(object.value);
  } else if (object.termType === "Literal") {
    // we can't use the sparqlEscape function because it can for instance add timezones to our
    // datetimes and then they are not considered equal to sparql
    if (
      object.datatype?.value === "http://www.w3.org/2001/XMLSchema#dateTime"
    ) {
      return `"${object.value}"^^<http://www.w3.org/2001/XMLSchema#dateTime>`;
    }

    if (object.datatype) {
      return `${sparqlEscape(
        object.value,
        datatypeNames[object.datatype.value] || "string"
      )}`;
    } else if (object.language) {
      return `${sparqlEscapeString(object.value)}@${object.language}`;
    } else {
      return sparqlEscapeString(object.value);
    }
  } else {
    throw new Error(`Unsupported term type ${object.termType}`);
  }
}

async function addTriplesToLDesDumpGraph(triples: string) {
  await updateSudo(
    `
      INSERT DATA {
        GRAPH ${sparqlEscapeUri(HEALING_DUMP_GRAPH)} {
          ${triples}
        }
      }
    `,
    {},
    { sparqlEndpoint: DIRECT_DB_ENDPOINT, mayRetry: true }
  );
}
