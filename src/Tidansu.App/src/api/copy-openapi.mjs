import { copyFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// B-21: copies the build-time-generated OpenAPI doc (Microsoft.Extensions.ApiDescription.Server,
// emitted by `dotnet build ../Tidansu.API -p:OpenApiGenerateDocumentsOnBuild=true`) into the
// frontend tree, replacing the old `swagger tofile` step against the API's built DLL.
const sourceDir = '../Tidansu.API/obj/openapi';
const destPath = './src/api/api.json';

if (!existsSync(sourceDir)) {
    throw new Error(`OpenAPI output directory ${sourceDir} does not exist — did the build:api-file step run?`);
}

const matches = readdirSync(sourceDir).filter((name) => name.endsWith('.json'));

if (matches.length === 0) {
    throw new Error(`No OpenAPI document found in ${sourceDir} — did the build:api-file step run?`);
}
if (matches.length > 1) {
    throw new Error(`Expected exactly one OpenAPI document in ${sourceDir}, found: ${matches.join(', ')}`);
}

copyFileSync(join(sourceDir, matches[0]), destPath);
console.log(`Copied ${matches[0]} to ${destPath}.`);
