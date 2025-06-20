import ttl_read from "@graphy/content.ttl.read";
import fs from "fs";
import path from "path";
import jsstream from "stream";
import rdfParser from "rdf-parse";

import rdfSerializer from "rdf-serialize";
import { DATA_FOLDER } from "../environment";

/**
 * Reads the triples in a file, assuming text/turtle.
 *
 * @param {string} file File path where the turtle file is stored.
 * @return {Stream} Stream containing all triples which were downloaded.
 */

export function ttlFileAsContentType(
  file: string,
  contentType: string,
  domainName?: string
): NodeJS.ReadableStream {
  const triplesStream = readTriplesStream(
    file,
    domainName && domainName + path.relative(`${DATA_FOLDER}/`, file)
  );
  return rdfSerializer.serialize(triplesStream, {
    contentType: contentType,
  });
}

export function ttlFileAsString(
  file: string,
  contentType: string
): Promise<string> {
  const stream = ttlFileAsContentType(file, contentType);
  const chunks: Buffer[] = [];
  return new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function readTriplesStream(file: string, baseIRI?: string): jsstream.Readable {
  if (!fs.existsSync(file)) {
    throw Error(`File does not exist: ${file}`);
  }
  const fileStream = fs.createReadStream(file);
  if (baseIRI) {
    return rdfParser.parse(fileStream, {
      contentType: "text/turtle",
      baseIRI,
    });
  } else {
    return fileStream.pipe(ttl_read());
  }
}
