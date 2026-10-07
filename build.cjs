const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), read('template.html').replace('/*DOCX_VENDOR*/',()=>read('vendor/docx/docx-9.6.1.iife.js').replace(/<\/script/g,'<\\/script')).replace('/*DOCX_CORE*/',()=>read('shared/calculation-docx.js')).replace('/*ENGINE*/', () => read('engine.js')).replace('/*UI*/', () => read('ui.js')));
console.log('Built index.html');

