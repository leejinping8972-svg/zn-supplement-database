import mysql from 'mysql2/promise';
import {config} from './config.mjs';
let c;
try{
 const {database,...options}=config.db;
 c=await mysql.createConnection(options);
 const [databases]=await c.query('SHOW DATABASES');
 const [[info]]=await c.query('SELECT VERSION() AS version, CURRENT_USER() AS account');
 const [tls]=await c.query("SHOW STATUS LIKE 'Ssl_cipher'");
 console.log(JSON.stringify({connected:true,databases:databases.map(r=>r.Database),version:info.version,tls:tls[0]?.Value||'none'}));
}catch(e){console.log(JSON.stringify({connected:false,code:e.code||null,message:e.message.replaceAll(config.db.password||'__none__','[redacted]')}));process.exitCode=1;}
finally{if(c)await c.end();}
