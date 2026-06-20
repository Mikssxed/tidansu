import { readFileSync, writeFileSync } from 'fs';

const specPath = './src/api/api.json';
const tsPath = './src/api/apiClient/models/index.ts';

const spec = JSON.parse(readFileSync(specPath, 'utf8'));

// Build map: interface name → set of property names that are required and non-nullable
const requiredByInterface = new Map();
for (const [schemaName, schema] of Object.entries(spec.components?.schemas ?? {})) {
    // Skip request body types — their required fields mix URL path params with body params
    if (schemaName.endsWith('Command') || schemaName.endsWith('Query')) continue;
    if (!schema.properties || !schema.required) continue;
    const requiredSet = new Set(schema.required);
    const required = new Set();
    for (const [propName, prop] of Object.entries(schema.properties)) {
        if (requiredSet.has(propName) && !prop.nullable) {
            required.add(propName);
        }
    }
    if (required.size > 0) requiredByInterface.set(schemaName, required);
}

// Patch the generated TypeScript line by line
const lines = readFileSync(tsPath, 'utf8').split('\n');
let currentInterface = null;
const result = [];

for (const line of lines) {
    const interfaceMatch = line.match(/^export interface (\w+) extends Parsable \{/);
    if (interfaceMatch) {
        currentInterface = interfaceMatch[1];
        result.push(line);
        continue;
    }

    if (/^}\r?$/.test(line)) {
        currentInterface = null;
        result.push(line);
        continue;
    }

    const required = currentInterface && requiredByInterface.get(currentInterface);
    if (required) {
        // Match: `    propName?: SomeType | null;`
        const propMatch = line.match(/^(\s+)(\w+)(\?)(: )([^\n|]+?)( \| null)(;?\r?)$/);
        if (propMatch) {
            const [, indent, propName, , colon, type, , semicolon] = propMatch;
            if (required.has(propName)) {
                result.push(`${indent}${propName}${colon}${type}${semicolon}`);
                continue;
            }
        }
    }

    result.push(line);
}

writeFileSync(tsPath, result.join('\n'));

const patched = [...requiredByInterface.entries()]
    .map(([name, fields]) => `${name}(${[...fields].join(', ')})`)
    .join(', ');
console.log(`Generated TypeScript patched — required non-nullable fields in: ${patched}`);
