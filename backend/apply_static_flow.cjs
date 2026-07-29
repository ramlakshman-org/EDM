const fs = require('fs');

const staticSchema = fs.readFileSync('flow_published_schema.json', 'utf-8');
fs.writeFileSync('flow_schema.json', staticSchema);
console.log('Copied flow_published_schema.json to flow_schema.json!');
