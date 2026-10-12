import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=express();const prefix='/zn-supplement-database/';
app.get('/',(_,res)=>res.redirect(prefix));app.use(prefix,express.static(path.join(root,'preview-dist')));
app.listen(4173,'127.0.0.1',()=>console.log('Read-only preview: http://127.0.0.1:4173'+prefix));
