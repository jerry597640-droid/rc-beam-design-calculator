const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), read('template.html').replace('/*ENGINE*/', () => read('engine.js')).replace('/*UI*/', () => read('ui.js')));
console.log('Built index.html');
