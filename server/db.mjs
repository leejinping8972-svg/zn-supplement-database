import mysql from 'mysql2/promise';
import {config} from './config.mjs';
export const pool=mysql.createPool({...config.db,waitForConnections:true,connectionLimit:6,queueLimit:20,decimalNumbers:true,dateStrings:['DATE'],enableKeepAlive:true});
pool.on('connection',connection=>connection.query("SET time_zone = '+00:00'"));
export const jsonValue=value=>typeof value==='string'?JSON.parse(value):value;
export class AppError extends Error{constructor(status,message,code='REQUEST_FAILED'){super(message);this.status=status;this.code=code;}}
export async function approval(connection=pool,lock=false){
 const [rows]=await connection.query("SELECT setting_value FROM si_settings WHERE setting_key='product_ingestion'"+(lock?' FOR UPDATE':''));
 return rows[0]?jsonValue(rows[0].setting_value):{approved:false};
}
export async function requireApproved(connection=pool,lock=false){
 const state=await approval(connection,lock);
 if(!state.approved)throw new AppError(423,'商品采集与入库尚未通过审核','APPROVAL_REQUIRED');
 return state;
}
export function assertSiteAllowed(state,siteIds){
 if(Array.isArray(state.allowedSiteIds)&&siteIds.some(id=>!state.allowedSiteIds.includes(Number(id))))throw new AppError(423,'该站点的商品采集与分析尚未获得授权','SITE_NOT_APPROVED');
}
export async function requireSiteApproved(siteId,connection=pool,lock=false){
 const state=await requireApproved(connection,lock);assertSiteAllowed(state,[siteId]);return state;
}
export async function transaction(fn){
 const c=await pool.getConnection();
 try{await c.beginTransaction();const value=await fn(c);await c.commit();return value;}
 catch(e){await c.rollback();throw e;}finally{c.release();}
}
