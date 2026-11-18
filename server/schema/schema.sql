SET NAMES utf8mb4;

SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS auth_users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  email VARCHAR(255) NULL,
  encrypted_password VARCHAR(255) NULL,
  email_confirmed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  last_sign_in_at DATETIME(6) NULL,
  raw_user_meta_data JSON NULL,
  raw_app_meta_data JSON NULL,
  phone VARCHAR(64) NULL,
  banned_until DATETIME(6) NULL,
  deleted_at DATETIME(6) NULL,
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY auth_users_email_key (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  KEY auth_refresh_tokens_user (user_id),
  CONSTRAINT auth_refresh_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS auth_one_time_tokens (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_type VARCHAR(32) NOT NULL,
  redirect_to LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  KEY auth_ott_user (user_id),
  CONSTRAINT auth_ott_user_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS storage_objects (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  bucket_id VARCHAR(64) NOT NULL,
  name VARCHAR(512) NOT NULL,
  owner CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY storage_objects_bucket_name (bucket_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS app_sequences (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  value BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS app_kv (
  k VARCHAR(128) NOT NULL PRIMARY KEY,
  v LONGTEXT NULL,
  updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `course_types` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `color` LONGTEXT NULL DEFAULT ('#C8A97E'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `image_url` LONGTEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `trainers` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `first_name` LONGTEXT NOT NULL,
  `last_name` LONGTEXT NOT NULL,
  `email` LONGTEXT NULL,
  `phone` LONGTEXT NULL,
  `bio` LONGTEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `street` LONGTEXT NULL,
  `postal_code` LONGTEXT NULL,
  `city` LONGTEXT NULL,
  `country` LONGTEXT NULL DEFAULT ('Deutschland'),
  `tax_id` LONGTEXT NULL,
  `tax_number` LONGTEXT NULL,
  `iban` LONGTEXT NULL,
  `bic` LONGTEXT NULL,
  `bank_name` LONGTEXT NULL,
  `is_small_business` TINYINT(1) NOT NULL DEFAULT 1,
  `invited_at` DATETIME(6) NULL,
  `onboarded_at` DATETIME(6) NULL,
  `onboarding_dismissed` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `trainers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `courses` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_type_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `instructor_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `start_time` DATETIME(6) NOT NULL,
  `end_time` DATETIME(6) NOT NULL,
  `max_participants` INT NOT NULL DEFAULT 12,
  `price` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `is_cancelled` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `series_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `image_url` LONGTEXT NULL,
  `color` LONGTEXT NULL,
  `location` LONGTEXT NULL,
  `is_visible` TINYINT(1) NOT NULL DEFAULT 1,
  `booking_opens_immediately` TINYINT(1) NOT NULL DEFAULT 1,
  `booking_closes_at_start` TINYINT(1) NOT NULL DEFAULT 1,
  `min_participants` INT NULL,
  `co_instructor_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `internal_notes` LONGTEXT NULL,
  `course_no` INT NULL,
  `booking_opens_at` DATETIME(6) NULL,
  `class_cards_allowed` TINYINT(1) NOT NULL DEFAULT 1,
  `direct_trainer_booking` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_courses_start_time` (`start_time`),
  KEY `idx_courses_course_type` (`course_type_id`),
  KEY `idx_courses_series_id` (`series_id`),
  KEY `idx_courses_instructor_id` (`instructor_id`),
  CONSTRAINT `courses_course_type_id_fkey` FOREIGN KEY (`course_type_id`) REFERENCES `course_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `courses_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `trainers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `vouchers` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `code` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `discount_percent` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `applies_to` JSON NOT NULL DEFAULT ('["all"]'),
  `product_ids` JSON NOT NULL DEFAULT ('[]'),
  `course_type_ids` JSON NOT NULL DEFAULT ('[]'),
  `class_card_types` JSON NOT NULL DEFAULT ('[]'),
  `valid_from` DATETIME(6) NULL,
  `valid_until` DATETIME(6) NULL,
  `max_total_uses` INT NULL,
  `max_uses_per_customer` INT NULL,
  `is_single_use` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `times_used` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_by` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `video_course_ids` JSON NOT NULL DEFAULT ('[]'),
  `discount_amount_fixed` DECIMAL(14,4) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `vouchers_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `auth_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_number` VARCHAR(255) NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT ('pending'),
  `subtotal` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `tax_total` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `total` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `payment_method` LONGTEXT NULL,
  `payment_id` LONGTEXT NULL,
  `paid_at` DATETIME(6) NULL,
  `billing_first_name` LONGTEXT NULL,
  `billing_last_name` LONGTEXT NULL,
  `billing_email` LONGTEXT NULL,
  `billing_phone` LONGTEXT NULL,
  `billing_street` LONGTEXT NULL,
  `billing_postal_code` LONGTEXT NULL,
  `billing_city` LONGTEXT NULL,
  `billing_country` LONGTEXT NULL,
  `invoice_number` VARCHAR(255) NULL,
  `invoice_pdf_path` LONGTEXT NULL,
  `invoice_issued_at` DATETIME(6) NULL,
  `notes` LONGTEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `voucher_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `voucher_code` LONGTEXT NULL,
  `discount_amount` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `card_assignments` JSON NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `orders_invoice_number_uq` (`invoice_number`),
  UNIQUE KEY `orders_order_number_uq` (`order_number`),
  CONSTRAINT `orders_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT ('confirmed'),
  `payment_method` VARCHAR(64) NULL,
  `payment_id` LONGTEXT NULL,
  `amount_paid` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `paid_with_card` TINYINT(1) NOT NULL DEFAULT 0,
  `card_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `refunded` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `voucher_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `voucher_code` LONGTEXT NULL,
  `discount_amount` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bookings_user` (`user_id`),
  KEY `idx_bookings_course` (`course_id`),
  KEY `idx_bookings_order` (`order_id`),
  CONSTRAINT `bookings_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bookings_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bookings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bookings_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `products` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `image_url` LONGTEXT NULL,
  `kind` VARCHAR(64) NOT NULL DEFAULT ('physical'),
  `price` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(14,4) NOT NULL DEFAULT 19,
  `stock` INT NULL,
  `sku` LONGTEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `card_credits` INT NULL,
  `card_validity_days` INT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `card_type` VARCHAR(64) NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `cart_items_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cart_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cart_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `class_cards` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `card_type` VARCHAR(64) NOT NULL,
  `total_credits` INT NOT NULL,
  `remaining_credits` INT NOT NULL,
  `payment_method` VARCHAR(64) NULL,
  `payment_id` LONGTEXT NULL,
  `amount_paid` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `purchased_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `granted_by` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `grant_note` LONGTEXT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT ('active'),
  `cancelled_at` DATETIME(6) NULL,
  `cancelled_by` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `cancel_reason` LONGTEXT NULL,
  `order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (`id`),
  KEY `idx_class_cards_user` (`user_id`),
  KEY `idx_class_cards_status` (`status`),
  KEY `idx_class_cards_order` (`order_id`),
  CONSTRAINT `class_cards_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `class_cards_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `company_settings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `singleton` TINYINT(1) NOT NULL DEFAULT 1,
  `company_name` LONGTEXT NOT NULL DEFAULT ('Santosha Yoga by Tessa'),
  `owner_name` LONGTEXT NULL,
  `street` LONGTEXT NULL,
  `postal_code` LONGTEXT NULL,
  `city` LONGTEXT NULL,
  `country` LONGTEXT NULL DEFAULT ('Deutschland'),
  `email` LONGTEXT NULL,
  `phone` LONGTEXT NULL,
  `website` LONGTEXT NULL,
  `tax_id` LONGTEXT NULL,
  `tax_number` LONGTEXT NULL,
  `bank_name` LONGTEXT NULL,
  `iban` LONGTEXT NULL,
  `bic` LONGTEXT NULL,
  `invoice_footer` LONGTEXT NULL,
  `logo_url` LONGTEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `invoice_payment_days` INT NOT NULL DEFAULT 14,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_settings_singleton_uq` (`singleton`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `course_templates` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_type_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `instructor_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `day_of_week` INT NOT NULL,
  `start_time_of_day` TIME NOT NULL,
  `duration_minutes` INT NOT NULL DEFAULT 60,
  `max_participants` INT NOT NULL DEFAULT 12,
  `price` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `end_date` DATE NULL,
  `direct_trainer_booking` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `course_templates_course_type_id_fkey` FOREIGN KEY (`course_type_id`) REFERENCES `course_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `course_templates_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `trainers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `email_send_log` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `trigger_key` LONGTEXT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `subject` LONGTEXT NULL,
  `body_html` LONGTEXT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT ('pending'),
  `error_message` LONGTEXT NULL,
  `source` VARCHAR(255) NOT NULL DEFAULT ('transactional'),
  `metadata` JSON NOT NULL DEFAULT ('{}'),
  `sent_at` DATETIME(6) NULL,
  `delivered_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_email_send_log_created_at` (`created_at`),
  KEY `idx_email_send_log_status` (`status`),
  KEY `idx_email_send_log_source` (`source`),
  KEY `idx_email_send_log_recipient` (`recipient_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `email_settings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `domain` LONGTEXT NULL,
  `from_name` LONGTEXT NULL,
  `from_email` LONGTEXT NULL,
  `reply_to` LONGTEXT NULL,
  `smtp_host` LONGTEXT NULL,
  `smtp_port` INT NULL DEFAULT 587,
  `smtp_user` LONGTEXT NULL,
  `smtp_pass` LONGTEXT NULL,
  `smtp_secure` LONGTEXT NOT NULL DEFAULT ('starttls'),
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `email_templates` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `subject` LONGTEXT NOT NULL,
  `body_html` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `trigger_key` VARCHAR(255) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `description` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_templates_name_uq` (`name`),
  UNIQUE KEY `email_templates_trigger_key_uq` (`trigger_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_campaigns` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `subject` LONGTEXT NOT NULL,
  `preheader` LONGTEXT NULL,
  `content_json` JSON NOT NULL DEFAULT ('[]'),
  `html_cached` LONGTEXT NULL,
  `status` LONGTEXT NOT NULL DEFAULT ('draft'),
  `scheduled_at` DATETIME(6) NULL,
  `sent_at` DATETIME(6) NULL,
  `audience_filter` JSON NOT NULL DEFAULT ('{"type": "opt_in"}'),
  `created_by` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_bounces` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `email` LONGTEXT NOT NULL,
  `bounce_type` LONGTEXT NOT NULL,
  `reason` LONGTEXT NULL,
  `campaign_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  CONSTRAINT `newsletter_bounces_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `newsletter_campaigns` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_links` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `url` LONGTEXT NOT NULL,
  `label` LONGTEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  CONSTRAINT `newsletter_links_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `newsletter_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_recipients` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `email` VARCHAR(255) NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `sent_at` DATETIME(6) NULL,
  `opened_at` DATETIME(6) NULL,
  `open_count` INT NOT NULL DEFAULT 0,
  `last_clicked_at` DATETIME(6) NULL,
  `click_count` INT NOT NULL DEFAULT 0,
  `error` LONGTEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `newsletter_recipients_campaign_id_email_uq` (`campaign_id`, `email`),
  KEY `idx_newsletter_recipients_campaign` (`campaign_id`),
  KEY `idx_newsletter_recipients_user` (`user_id`),
  CONSTRAINT `newsletter_recipients_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `newsletter_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_clicks` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `recipient_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `link_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clicked_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `ip` LONGTEXT NULL,
  `user_agent` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_newsletter_clicks_recipient` (`recipient_id`),
  CONSTRAINT `newsletter_clicks_link_id_fkey` FOREIGN KEY (`link_id`) REFERENCES `newsletter_links` (`id`) ON DELETE CASCADE,
  CONSTRAINT `newsletter_clicks_recipient_id_fkey` FOREIGN KEY (`recipient_id`) REFERENCES `newsletter_recipients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_settings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `smtp_host` LONGTEXT NULL,
  `smtp_port` INT NULL DEFAULT 587,
  `smtp_user` LONGTEXT NULL,
  `smtp_pass` LONGTEXT NULL,
  `smtp_secure` LONGTEXT NOT NULL DEFAULT ('starttls'),
  `from_name` LONGTEXT NULL,
  `from_email` LONGTEXT NULL,
  `reply_to` LONGTEXT NULL,
  `footer_text` LONGTEXT NULL,
  `footer_address` LONGTEXT NULL,
  `rate_per_minute` INT NOT NULL DEFAULT 60,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_suppressions` (
  `email` VARCHAR(255) NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_templates` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `content_json` JSON NOT NULL DEFAULT ('[]'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `newsletter_unsubscribe_tokens` (
  `email` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`email`),
  UNIQUE KEY `newsletter_unsubscribe_tokens_token_uq` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `number_sequences` (
  `scope` VARCHAR(255) NOT NULL,
  `year` INT NOT NULL,
  `last_value` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`scope`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `item_type` VARCHAR(64) NOT NULL,
  `name` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(14,4) NOT NULL DEFAULT 19,
  `line_total` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order_id` (`order_id`),
  CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `payment_settings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `provider` VARCHAR(255) NOT NULL,
  `mode` LONGTEXT NOT NULL DEFAULT ('sandbox'),
  `client_id` LONGTEXT NULL,
  `client_secret` LONGTEXT NULL,
  `webhook_id` LONGTEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_settings_provider_uq` (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `profiles` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `first_name` LONGTEXT NULL,
  `last_name` LONGTEXT NULL,
  `phone` LONGTEXT NULL,
  `birthday` DATE NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `email` LONGTEXT NULL,
  `street` LONGTEXT NULL,
  `postal_code` LONGTEXT NULL,
  `city` LONGTEXT NULL,
  `country` LONGTEXT NULL DEFAULT ('Deutschland'),
  `newsletter_opt_in` TINYINT(1) NOT NULL DEFAULT 0,
  `is_guest` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `profiles_user_id_uq` (`user_id`),
  CONSTRAINT `profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `trainer_compensation_tiers` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `trainer_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_type_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `min_participants` INT NOT NULL DEFAULT 0,
  `max_participants` INT NOT NULL DEFAULT 9,
  `amount` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_tiers_trainer` (`trainer_id`, `course_type_id`),
  CONSTRAINT `trainer_compensation_tiers_course_type_id_fkey` FOREIGN KEY (`course_type_id`) REFERENCES `course_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `trainer_compensation_tiers_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `trainers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `trainer_payouts` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payout_number` LONGTEXT NULL,
  `trainer_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT ('requested'),
  `subtotal` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `vat_rate` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `vat_amount` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `total` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `pdf_path` LONGTEXT NULL,
  `trainer_snapshot` JSON NULL,
  `note` LONGTEXT NULL,
  `requested_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `approved_at` DATETIME(6) NULL,
  `approved_by` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_payouts_trainer` (`trainer_id`, `status`),
  CONSTRAINT `trainer_payouts_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `trainers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `trainer_earnings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `trainer_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_date` DATETIME(6) NOT NULL,
  `participants_count` INT NOT NULL DEFAULT 0,
  `tier_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `amount` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `status` VARCHAR(255) NOT NULL DEFAULT ('pending'),
  `payout_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `trainer_earnings_trainer_id_course_id_uq` (`trainer_id`, `course_id`),
  KEY `idx_earnings_trainer_status` (`trainer_id`, `status`),
  KEY `idx_earnings_payout` (`payout_id`),
  CONSTRAINT `trainer_earnings_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `trainer_earnings_payout_id_fkey` FOREIGN KEY (`payout_id`) REFERENCES `trainer_payouts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `trainer_earnings_tier_id_fkey` FOREIGN KEY (`tier_id`) REFERENCES `trainer_compensation_tiers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `trainer_earnings_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `trainers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `role` VARCHAR(64) NOT NULL DEFAULT ('customer'),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_roles_user_id_role_uq` (`user_id`, `role`),
  CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `video_courses` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` LONGTEXT NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `description` LONGTEXT NULL,
  `cover_image_url` LONGTEXT NULL,
  `is_published` TINYINT(1) NOT NULL DEFAULT 0,
  `access_model` VARCHAR(64) NOT NULL DEFAULT ('one_time'),
  `price_once` DECIMAL(14,4) NULL,
  `price_monthly` DECIMAL(14,4) NULL,
  `price_yearly` DECIMAL(14,4) NULL,
  `grace_days` INT NOT NULL DEFAULT 7,
  `sort_order` INT NOT NULL DEFAULT 0,
  `paypal_plan_monthly_id` LONGTEXT NULL,
  `paypal_plan_yearly_id` LONGTEXT NULL,
  `paypal_product_id` LONGTEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `video_courses_slug_uq` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `video_course_access` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `access_type` VARCHAR(64) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT ('active'),
  `current_period_end` DATETIME(6) NULL,
  `grace_until` DATETIME(6) NULL,
  `paypal_subscription_id` LONGTEXT NULL,
  `paypal_order_id` LONGTEXT NULL,
  `last_payment_at` DATETIME(6) NULL,
  `cancelled_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `video_course_access_user_id_course_id_uq` (`user_id`, `course_id`),
  KEY `idx_video_course_access_user` (`user_id`),
  KEY `idx_video_course_access_order` (`order_id`),
  CONSTRAINT `video_course_access_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `video_courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `video_course_access_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `video_course_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `video_course_payments` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `access_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `provider_event_id` LONGTEXT NULL,
  `amount` DECIMAL(14,4) NULL,
  `currency` LONGTEXT NULL DEFAULT ('EUR'),
  `event_type` VARCHAR(64) NOT NULL,
  `paid_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `raw_payload` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  CONSTRAINT `video_course_payments_access_id_fkey` FOREIGN KEY (`access_id`) REFERENCES `video_course_access` (`id`) ON DELETE SET NULL,
  CONSTRAINT `video_course_payments_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `video_courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `video_course_payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `video_course_voucher_plans` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `voucher_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `interval_unit` VARCHAR(255) NOT NULL,
  `discount_percent` DECIMAL(14,4) NOT NULL,
  `paypal_plan_id` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `video_course_voucher_plans_course_id_voucher_id_in_2327a682` (`course_id`, `voucher_id`, `interval_unit`, `discount_percent`),
  CONSTRAINT `video_course_voucher_plans_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `video_courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `video_course_voucher_plans_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `video_lessons` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `course_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `provider` VARCHAR(64) NOT NULL DEFAULT ('vimeo'),
  `video_id` LONGTEXT NOT NULL,
  `duration_seconds` INT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_free_preview` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_video_lessons_course` (`course_id`, `sort_order`),
  CONSTRAINT `video_lessons_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `video_courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `video_lesson_progress` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `lesson_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seconds_watched` INT NOT NULL DEFAULT 0,
  `completed_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `video_lesson_progress_user_id_lesson_id_uq` (`user_id`, `lesson_id`),
  CONSTRAINT `video_lesson_progress_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `video_lessons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `video_lesson_progress_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `voucher_redemptions` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `voucher_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `booking_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `discount_amount` DECIMAL(14,4) NOT NULL DEFAULT 0,
  `redeemed_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `voucher_redemptions_voucher_idx` (`voucher_id`),
  KEY `voucher_redemptions_user_idx` (`user_id`),
  CONSTRAINT `voucher_redemptions_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `voucher_redemptions_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `voucher_redemptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `voucher_redemptions_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
