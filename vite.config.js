import { defineConfig } from 'vite';
export default defineConfig(({mode})=>({base:mode==='preview'?'./':'/',publicDir:mode==='preview'?'preview-data':false,define:{'import.meta.env.VITE_READ_ONLY':JSON.stringify(mode==='preview')},build:{outDir:mode==='preview'?'preview-dist':'dist',emptyOutDir:true},server:{host:'127.0.0.1'},preview:{host:'127.0.0.1',port:4173},esbuild:{jsx:'automatic'}}));
