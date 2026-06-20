import { readFileSync, writeFileSync } from 'fs';

const specPath = './src/api/api.json';
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

for (const schema of Object.values(spec.components?.schemas ?? {})) {
    if (!schema.properties) continue;

    const required = new Set(schema.required ?? []);

    for (const [name, prop] of Object.entries(schema.properties)) {
        if (prop.nullable) {
            required.delete(name);
        } else {
            required.add(name);
        }
    }

    schema.required = required.size > 0 ? [...required].sort() : undefined;
}

writeFileSync(specPath, JSON.stringify(spec, null, 2));
console.log('OpenAPI spec patched for Kiota generation.');
