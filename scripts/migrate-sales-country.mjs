import {pool} from '../server/db.mjs';
import {migrateSalesCountry} from '../server/sales-country.mjs';
const connection=await pool.getConnection();
try{console.log(JSON.stringify(await migrateSalesCountry(connection)));}
finally{connection.release();await pool.end();}
