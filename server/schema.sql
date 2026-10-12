CREATE TABLE IF NOT EXISTS si_sites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_key INT NOT NULL UNIQUE,
  display_order INT NOT NULL,
  brand VARCHAR(190) NOT NULL,
  url TEXT NOT NULL,
  domain VARCHAR(253) NOT NULL UNIQUE,
  country VARCHAR(190) NOT NULL,
  category VARCHAR(190) NOT NULL,
  intro TEXT NOT NULL,
  main_products TEXT NOT NULL,
  public_address TEXT,
  address_type VARCHAR(190),
  country_note TEXT,
  china_status VARCHAR(190) NOT NULL,
  china_ops VARCHAR(190) NOT NULL,
  china_summary TEXT,
  china_source TEXT,
  china_quote TEXT,
  company_source TEXT,
  source_date DATE NOT NULL,
  watched BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sites_country (country),
  INDEX idx_sites_china (china_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_settings (
  setting_key VARCHAR(190) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT UNSIGNED NOT NULL,
  url TEXT NOT NULL,
  url_hash CHAR(64) NOT NULL,
  source_product_id VARCHAR(190),
  name_original VARCHAR(512) NOT NULL,
  name_zh VARCHAR(512),
  translation_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  description_text MEDIUMTEXT,
  price DECIMAL(14,4),
  currency VARCHAR(8),
  dosage_form VARCHAR(100),
  serving_size VARCHAR(190),
  source_language VARCHAR(30),
  analysis_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  analysis JSON,
  raw_data JSON,
  content_hash CHAR(64) NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_product_url (site_id,url_hash),
  INDEX idx_product_site (site_id),
  INDEX idx_product_analysis (analysis_status),
  CONSTRAINT fk_product_site FOREIGN KEY (site_id) REFERENCES si_sites(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_product_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  image_url TEXT NOT NULL,
  alt_text VARCHAR(512),
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_image_product FOREIGN KEY (product_id) REFERENCES si_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_product_ingredients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  name_original VARCHAR(190) NOT NULL,
  name_zh VARCHAR(190) NOT NULL,
  canonical_key VARCHAR(100) NOT NULL,
  amount_text VARCHAR(190),
  evidence_text TEXT NOT NULL,
  evidence_scope VARCHAR(40) NOT NULL,
  method VARCHAR(30) NOT NULL,
  INDEX idx_ingredient_key (canonical_key),
  CONSTRAINT fk_ingredient_product FOREIGN KEY (product_id) REFERENCES si_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_product_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  content_hash CHAR(64) NOT NULL,
  snapshot JSON NOT NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_snapshot (product_id,content_hash),
  CONSTRAINT fk_snapshot_product FOREIGN KEY (product_id) REFERENCES si_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  options JSON NOT NULL,
  progress JSON,
  result JSON,
  error_message TEXT,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  INDEX idx_job_status (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_job_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_event (job_id,id),
  CONSTRAINT fk_event_job FOREIGN KEY (job_id) REFERENCES si_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(60) NOT NULL,
  actor VARCHAR(190) NOT NULL,
  details JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_keywords (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name_zh VARCHAR(190) NOT NULL,
  name_en VARCHAR(190) NOT NULL,
  category VARCHAR(100) NOT NULL,
  aliases JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  keyword_type VARCHAR(30) NOT NULL DEFAULT 'topic',
  source VARCHAR(190) NOT NULL DEFAULT 'manual',
  heat_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  search_volume INT UNSIGNED NULL,
  heat_source VARCHAR(190) NULL,
  heat_market VARCHAR(100) NULL,
  heat_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_keyword_name (name_zh),
  INDEX idx_keyword_category (category,enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_product_keywords (
  product_id BIGINT UNSIGNED NOT NULL,
  keyword_id BIGINT UNSIGNED NOT NULL,
  evidence_text TEXT NOT NULL,
  matched_term VARCHAR(190) NOT NULL,
  evidence_scope VARCHAR(30) NOT NULL,
  method VARCHAR(30) NOT NULL DEFAULT 'literal_v1',
  matched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id,keyword_id),
  INDEX idx_keyword_product (keyword_id,product_id),
  CONSTRAINT fk_pk_product FOREIGN KEY (product_id) REFERENCES si_products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pk_keyword FOREIGN KEY (keyword_id) REFERENCES si_keywords(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_search_pages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  keyword_id BIGINT UNSIGNED NULL,
  keyword_name VARCHAR(190) NOT NULL,
  query_text VARCHAR(190) NOT NULL,
  market CHAR(2) NOT NULL,
  page_number TINYINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  result_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT,
  searched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_search_page (job_id,keyword_id,page_number),
  CONSTRAINT fk_search_job FOREIGN KEY (job_id) REFERENCES si_jobs(id),
  CONSTRAINT fk_search_keyword FOREIGN KEY (keyword_id) REFERENCES si_keywords(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_discovered_pages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  search_page_id BIGINT UNSIGNED NOT NULL,
  url TEXT NOT NULL,
  url_hash CHAR(64) NOT NULL,
  domain VARCHAR(253) NOT NULL,
  title VARCHAR(512) NOT NULL,
  snippet TEXT,
  result_rank INT UNSIGNED NOT NULL,
  decision VARCHAR(30) NOT NULL DEFAULT 'pending',
  reason TEXT,
  evidence JSON,
  site_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at TIMESTAMP NULL,
  UNIQUE KEY uniq_discovery_result (search_page_id,url_hash),
  INDEX idx_discovery_domain (domain,decision),
  CONSTRAINT fk_discovered_search FOREIGN KEY (search_page_id) REFERENCES si_search_pages(id),
  CONSTRAINT fk_discovered_site FOREIGN KEY (site_id) REFERENCES si_sites(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_discovery_site_queue (
  site_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  job_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_discovery_queue_site FOREIGN KEY (site_id) REFERENCES si_sites(id),
  CONSTRAINT fk_discovery_queue_job FOREIGN KEY (job_id) REFERENCES si_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS si_site_analysis_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT UNSIGNED NOT NULL,
  job_id CHAR(36) NOT NULL,
  run_number INT UNSIGNED NOT NULL,
  run_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  products_processed INT UNSIGNED NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  result JSON,
  error_message TEXT,
  UNIQUE KEY uniq_run_job_site (job_id,site_id),
  UNIQUE KEY uniq_site_run_number (site_id,run_number),
  INDEX idx_run_started (started_at,id),
  CONSTRAINT fk_run_site FOREIGN KEY (site_id) REFERENCES si_sites(id),
  CONSTRAINT fk_run_job FOREIGN KEY (job_id) REFERENCES si_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
