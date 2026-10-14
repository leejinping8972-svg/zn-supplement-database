export const sourceColumns={
 source_platform:"VARCHAR(30) NOT NULL DEFAULT 'independent'",
 shop_name:'VARCHAR(190) NULL',shop_url:'TEXT NULL',platform_country:'VARCHAR(190) NULL',
 research_url:'TEXT NULL',platform_product_id:'VARCHAR(190) NULL',source_identity:'CHAR(64) NULL',
 concepts:'JSON NULL'
};
export async function migrateProductSource(c){
 const [columns]=await c.query('SHOW COLUMNS FROM si_products');
 const additions=Object.entries(sourceColumns).filter(([name])=>!columns.some(col=>col.Field===name)).map(([name,type])=>'ADD COLUMN '+name+' '+type);
 if(additions.length)await c.query('ALTER TABLE si_products '+additions.join(', '));
 if(columns.find(col=>col.Field==='site_id')?.Null==='NO')await c.query('ALTER TABLE si_products MODIFY site_id BIGINT UNSIGNED NULL');
 const [indexes]=await c.query('SHOW INDEX FROM si_products');
 if(!indexes.some(i=>i.Key_name==='uniq_source_identity'))await c.query('ALTER TABLE si_products ADD UNIQUE KEY uniq_source_identity (source_identity)');
 if(!indexes.some(i=>i.Key_name==='idx_source_platform'))await c.query('ALTER TABLE si_products ADD INDEX idx_source_platform (source_platform,platform_country)');
 return {columnsAdded:additions.length};
}
