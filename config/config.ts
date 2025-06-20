export type HealingConfig = Awaited<ReturnType<typeof getHealingConfig>>;
export const getHealingConfig = async () => {
  return {
    // this is the name of a stream, you can have multiple streams in the config,
    // the healing process will check them one by one sequentially
    public: {
      graphFilter:
        "?g <http://mu.semte.ch/vocabularies/ext/ownedBy> ?bestuurseenheid",
      entities: {
        // this is a type that should be present and verified on the LDES stream
        "http://data.vlaanderen.be/ns/mandaat#Mandataris": {
          // these are the predicates for which the healing will look for missing values on the ldes
          healingPredicates: [
            // this is the minimal config, one could also check all predicates per type, something like this:
            "http://purl.org/dc/terms/modified",
            // "http://data.vlaanderen.be/ns/mandaat#rangorde",
            // "http://data.vlaanderen.be/ns/mandaat#start",
            // "http://data.vlaanderen.be/ns/mandaat#einde",
            // "http://mu.semte.ch/vocabularies/ext/datumEedaflegging",
            // "http://mu.semte.ch/vocabularies/ext/datumMinistrieelBesluit",
            // "http://mu.semte.ch/vocabularies/ext/generatedFrom",
            // "http://www.w3.org/2004/02/skos/core#changeNote",
            // "http://data.vlaanderen.be/ns/mandaat#isTijdelijkVervangenDoor",
            // "http://schema.org/contactPoint",
            // "http://data.vlaanderen.be/ns/mandaat#beleidsdomein",
            // "http://www.w3.org/ns/org#holds",
            // "http://www.w3.org/ns/org#hasMembership",
            // "http://data.vlaanderen.be/ns/mandaat#isBestuurlijkeAliasVan",
            // "http://data.vlaanderen.be/ns/mandaat#status",
            // "http://mu.semte.ch/vocabularies/ext/lmb/hasPublicationStatus",
          ],
          // this will filter out instances in the database that are not expected to be on the stream
          // in this case, mandataris instances that are in the draft publication state will not be on the public stream,
          // but will be on the abb stream (not shown)
          instanceFilter: `OPTIONAL { ?s <http://lblod.data.gift/vocabularies/lmb/hasPublicationStatus> ?publicationStatus. }
        FILTER(!BOUND(?publicationStatus) || ?publicationStatus != <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07>)`,
        },
        "http://data.vlaanderen.be/ns/mandaat#Fractie": [
          // simple types only specify the array of predicates to check the values for
          "http://purl.org/dc/terms/modified",
        ],
        "http://www.w3.org/ns/org#Membership": [
          "http://purl.org/dc/terms/modified",
        ],
        "http://data.vlaanderen.be/ns/mandaat#Mandaat": [
          "http://purl.org/dc/terms/modified",
        ],
        "http://www.w3.org/ns/person#Person": [
          "http://purl.org/dc/terms/modified",
        ],
        "http://purl.org/dc/terms/PeriodOfTime": [
          "http://purl.org/dc/terms/modified",
        ],
        "http://www.w3.org/ns/activitystreams#Tombstone": {
          healingPredicates: ["http://purl.org/dc/terms/modified"],
          // an example filter that only erects tombstones if they don't have any other type in any other graph owned by an org
          healingFilter: `FILTER NOT EXISTS {
            GRAPH ?h {
             ?s a ?otherType.
             FILTER(?otherType != <http://www.w3.org/ns/activitystreams#Tombstone>)
            }
            ?h <http://mu.semte.ch/vocabularies/ext/ownedBy> ?org.
          }`,
        },
      },
      graphsToExclude: ["http://mu.semte.ch/graphs/besluiten-consumed"],
      graphTypesToExclude: ["http://mu.semte.ch/vocabularies/ext/FormHistory"],
    },
    // abb: {
    //   entities: {
    //     "http://www.w3.org/ns/adms#Identifier": [
    //       "http://purl.org/dc/terms/modified",
    //     ],
    //     "http://data.vlaanderen.be/ns/persoon#Geboorte": [
    //       "http://purl.org/dc/terms/modified",
    //     ],
    //   },
    //   graphsToExclude: ["http://mu.semte.ch/graphs/besluiten-consumed"],
    //   graphTypesToExclude: ["http://mu.semte.ch/vocabularies/ext/FormHistory"],
    // },
  };
};
