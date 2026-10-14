import { defineConfig } from 'vite';
import {readFileSync} from 'node:fs';
export default defineConfig(({mode})=>{
 const preview=mode==='preview';
 const snapshotVersion=preview?JSON.parse(readFileSync(new URL('./preview-data/data/overview.json',import.meta.url),'utf8')).snapshotAt:'';
 return {base:preview?'./':'/',publicDir:preview?'preview-data':false,
  define:{'import.meta.env.VITE_READ_ONLY':JSON.stringify(preview),'import.meta.env.VITE_SNAPSHOT_VERSION':JSON.stringify(snapshotVersion)},
  build:{outDir:preview?'preview-dist':'dist',emptyOutDir:true},server:{host:'127.0.0.1'},preview:{host:'127.0.0.1',port:4173},esbuild:{jsx:'automatic'}};
});
