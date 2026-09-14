CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`session_id` text,
	`target_type` text,
	`target_id` text,
	`query` text,
	`level_id` text,
	`x` real,
	`y` real,
	`meta` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analytics_event_idx` ON `analytics_events` (`event_id`,`type`);--> statement-breakpoint
CREATE INDEX `analytics_created_idx` ON `analytics_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes` text DEFAULT '["read","write"]' NOT NULL,
	`last_used_at` text,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_org_idx` ON `api_keys` (`org_id`);--> statement-breakpoint
CREATE TABLE `banners` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`exhibitor_id` text,
	`placement` text DEFAULT 'search_top' NOT NULL,
	`title` text,
	`image_url` text NOT NULL,
	`link_url` text,
	`active` integer DEFAULT true NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exhibitor_id`) REFERENCES `exhibitors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `banners_event_idx` ON `banners` (`event_id`);--> statement-breakpoint
CREATE TABLE `booth_exhibitors` (
	`booth_id` text NOT NULL,
	`exhibitor_id` text NOT NULL,
	`sort_index` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`booth_id`, `exhibitor_id`),
	FOREIGN KEY (`booth_id`) REFERENCES `booths`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exhibitor_id`) REFERENCES `exhibitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `booth_exhibitors_ex_idx` ON `booth_exhibitors` (`exhibitor_id`);--> statement-breakpoint
CREATE TABLE `booths` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`level_id` text NOT NULL,
	`label` text NOT NULL,
	`external_id` text,
	`polygon` text NOT NULL,
	`booth_type` text DEFAULT 'standard' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`price_cents` integer,
	`currency` text,
	`area_m2` real DEFAULT 0 NOT NULL,
	`width_m` real,
	`height_m` real,
	`rotation_deg` real DEFAULT 0 NOT NULL,
	`colors` text,
	`label_hidden` integer DEFAULT false NOT NULL,
	`height_3d` real,
	`notes` text,
	`hold_until` text,
	`sort_index` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `booths_event_idx` ON `booths` (`event_id`);--> statement-breakpoint
CREATE INDEX `booths_level_idx` ON `booths` (`level_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booths_event_label_idx` ON `booths` (`event_id`,`label`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`parent_id` text,
	`sort_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `categories_event_idx` ON `categories` (`event_id`);--> statement-breakpoint
CREATE TABLE `elements` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`level_id` text NOT NULL,
	`kind` text NOT NULL,
	`geometry` text NOT NULL,
	`props` text DEFAULT '{}' NOT NULL,
	`sort_index` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `elements_level_idx` ON `elements` (`level_id`);--> statement-breakpoint
CREATE INDEX `elements_event_idx` ON `elements` (`event_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`subtitle` text,
	`description` text,
	`starts_at` text,
	`ends_at` text,
	`timezone` text DEFAULT 'UTC',
	`venue_name` text,
	`venue_address` text,
	`venue_lat` real,
	`venue_lng` real,
	`status` text DEFAULT 'draft' NOT NULL,
	`settings` text NOT NULL,
	`published_version` integer DEFAULT 0 NOT NULL,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_org_idx` ON `events` (`org_id`);--> statement-breakpoint
CREATE TABLE `exhibitor_categories` (
	`exhibitor_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`exhibitor_id`, `category_id`),
	FOREIGN KEY (`exhibitor_id`) REFERENCES `exhibitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exhibitors` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`external_id` text,
	`grip_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo_url` text,
	`gallery` text DEFAULT '[]' NOT NULL,
	`description` text,
	`website` text,
	`email` text,
	`phone` text,
	`country` text,
	`address` text,
	`city` text,
	`zip` text,
	`featured` integer DEFAULT false NOT NULL,
	`sponsor_level` text,
	`custom_button_title` text,
	`custom_button_url` text,
	`video_url` text,
	`socials` text DEFAULT '{}' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`contact_name` text,
	`portal_token` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exhibitors_portal_token_unique` ON `exhibitors` (`portal_token`);--> statement-breakpoint
CREATE INDEX `exhibitors_event_idx` ON `exhibitors` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `exhibitors_event_slug_idx` ON `exhibitors` (`event_id`,`slug`);--> statement-breakpoint
CREATE TABLE `floorplan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`bundle` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `floorplan_versions_event_version_idx` ON `floorplan_versions` (`event_id`,`version`);--> statement-breakpoint
CREATE TABLE `levels` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`sort_index` integer DEFAULT 0 NOT NULL,
	`width_m` real DEFAULT 200 NOT NULL,
	`height_m` real DEFAULT 150 NOT NULL,
	`background` text,
	`georef` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `levels_event_idx` ON `levels` (`event_id`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`path` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`booth_id` text NOT NULL,
	`exhibitor_id` text,
	`status` text DEFAULT 'hold' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`provider` text DEFAULT 'mock' NOT NULL,
	`provider_ref` text,
	`checkout_url` text,
	`expires_at` text,
	`company` text,
	`contact_name` text,
	`contact_email` text,
	`notes` text,
	`paid_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booth_id`) REFERENCES `booths`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exhibitor_id`) REFERENCES `exhibitors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `orders_event_idx` ON `orders` (`event_id`);--> statement-breakpoint
CREATE INDEX `orders_booth_idx` ON `orders` (`booth_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `pricing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`booth_type` text,
	`min_area_m2` real,
	`max_area_m2` real,
	`price_cents` integer,
	`price_per_m2_cents` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`sort_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pricing_rules_event_idx` ON `pricing_rules` (`event_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`description` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`booth_id` text,
	`element_id` text,
	`speakers` text DEFAULT '[]' NOT NULL,
	`track` text,
	`url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booth_id`) REFERENCES `booths`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`element_id`) REFERENCES `elements`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sessions_event_idx` ON `sessions` (`event_id`);--> statement-breakpoint
CREATE TABLE `shared_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`items` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'stairs' NOT NULL,
	`accessible` integer DEFAULT false NOT NULL,
	`node_ids` text DEFAULT '[]' NOT NULL,
	`travel_seconds` integer DEFAULT 60 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transitions_event_idx` ON `transitions` (`event_id`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `way_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`level_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`accessible` integer DEFAULT true NOT NULL,
	`one_way` integer DEFAULT false NOT NULL,
	`virtual` integer DEFAULT false NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_node_id`) REFERENCES `way_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_node_id`) REFERENCES `way_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `way_edges_level_idx` ON `way_edges` (`level_id`);--> statement-breakpoint
CREATE TABLE `way_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`level_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `way_nodes_level_idx` ON `way_nodes` (`level_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_code` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` text,
	`delivered_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_hook_idx` ON `webhook_deliveries` (`webhook_id`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_status_idx` ON `webhook_deliveries` (`status`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`event_id` text,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text DEFAULT '["*"]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhooks_org_idx` ON `webhooks` (`org_id`);