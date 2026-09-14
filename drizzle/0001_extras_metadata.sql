CREATE TABLE `exhibitor_extras` (
	`id` text PRIMARY KEY NOT NULL,
	`extra_id` text NOT NULL,
	`exhibitor_id` text NOT NULL,
	`booth_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`extra_id`) REFERENCES `extras`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exhibitor_id`) REFERENCES `exhibitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booth_id`) REFERENCES `booths`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `exhibitor_extras_ex_idx` ON `exhibitor_extras` (`exhibitor_id`);--> statement-breakpoint
CREATE INDEX `exhibitor_extras_extra_idx` ON `exhibitor_extras` (`extra_id`);--> statement-breakpoint
CREATE TABLE `extras` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text DEFAULT 'sponsorship' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_cents` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`limit_per_event` integer,
	`limit_per_exhibitor` integer,
	`reserve_or_buy_allowed` integer DEFAULT true NOT NULL,
	`sort_index` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `extras_event_idx` ON `extras` (`event_id`);--> statement-breakpoint
ALTER TABLE `booths` ADD `metadata` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `exhibitors` ADD `leading_image_url` text;--> statement-breakpoint
ALTER TABLE `exhibitors` ADD `logo_in_booth` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `exhibitors` ADD `metadata` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `exhibitors` ADD `rebooking_state` integer DEFAULT 0 NOT NULL;