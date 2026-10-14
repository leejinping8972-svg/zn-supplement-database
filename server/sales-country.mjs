export function salesCountryFields(site={}){
 const value=String(site.country||'').trim();
 const country=value&&!/待核验|待确认|未确认|未知|unknown|unconfirmed/i.test(value)?value:null;
 return {
  sales_country:country,
  sales_country_basis:(country?'按来源独立站的国家资料归类，实际销售及配送范围待核验。':'来源独立站国家未确认，暂不推定销售国家。')+(site.country_note?' '+site.country_note:''),
  sales_country_source_url:site.url||null
 };
}

// Additive, repeatable migration. Existing values and collection dates are preserved.
export async function migrateSalesCountry(connection){
 const [columns]=await connection.query('SHOW COLUMNS FROM si_products');
 const definitions={sales_country:'VARCHAR(190) NULL',sales_country_basis:'TEXT NULL',sales_country_source_url:'TEXT NULL'};
 const additions=Object.entries(definitions).filter(([name])=>!columns.some(c=>c.Field===name)).map(([name,type])=>'ADD COLUMN '+name+' '+type);
 if(additions.length)await connection.query('ALTER TABLE si_products '+additions.join(', '));
 const [indexes]=await connection.query('SHOW INDEX FROM si_products');
 if(!indexes.some(i=>i.Key_name==='idx_product_sales_country'))await connection.query('ALTER TABLE si_products ADD INDEX idx_product_sales_country (sales_country)');
 let updated=0;
 await connection.beginTransaction();
 try{
  const [sites]=await connection.query('SELECT id,country,country_note,url FROM si_sites');
  for(const site of sites){
   const fields=salesCountryFields(site);
   const [result]=await connection.query('UPDATE si_products SET sales_country=?,sales_country_basis=?,sales_country_source_url=?,updated_at=updated_at WHERE site_id=? AND sales_country IS NULL AND sales_country_source_url IS NULL',[fields.sales_country,fields.sales_country_basis,fields.sales_country_source_url,site.id]);
   updated+=result.affectedRows;
  }
  if(updated)await connection.query('INSERT INTO si_audit_log (action,actor,details) VALUES (?,?,?)',['product_sales_country_backfilled','local_user',JSON.stringify({products:updated,basis:'source_site_country',shippingMarketsVerified:false})]);
  await connection.commit();return {updated,columnsAdded:additions.length};
 }catch(error){await connection.rollback();throw error;}
}
