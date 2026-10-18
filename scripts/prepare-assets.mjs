import {mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
const target=join(process.cwd(),'public','maplibre');
await mkdir(target,{recursive:true});
for(const file of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'])await copyFile(join('node_modules','maplibre-gl','dist',file),join(target,file));
await copyFile(join('node_modules','maplibre-gl','LICENSE.txt'),join(target,'LICENSE.txt'));
console.log('Prepared same-origin MapLibre workers.');
