CREATE TABLE `planet_catalogs` (
	`kind` text NOT NULL,
	`catalog_version` text NOT NULL,
	`schema_version` integer NOT NULL,
	`item_count` integer NOT NULL,
	`payload_json` text NOT NULL,
	`payload_bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`kind`, `catalog_version`),
	CONSTRAINT "planet_catalogs_payload_bound" CHECK("planet_catalogs"."payload_bytes" > 0 AND "planet_catalogs"."payload_bytes" <= 1450000)
);
--> statement-breakpoint
CREATE TABLE `planet_entity_index` (
	`world_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`shard_id` text NOT NULL,
	`region_key` text,
	`longitude` real,
	`latitude` real,
	`revision` integer NOT NULL,
	PRIMARY KEY(`world_id`, `commit_id`, `kind`, `entity_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_planet_entity_index_viewport` ON `planet_entity_index` (`world_id`,`commit_id`,`kind`,`latitude`,`longitude`);--> statement-breakpoint
CREATE TABLE `planet_entity_shards` (
	`world_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`kind` text NOT NULL,
	`shard_id` text NOT NULL,
	`revision` integer NOT NULL,
	`entity_count` integer NOT NULL,
	`payload_json` text NOT NULL,
	`payload_bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`world_id`, `commit_id`, `kind`, `shard_id`),
	CONSTRAINT "planet_entity_shards_payload_bound" CHECK("planet_entity_shards"."payload_bytes" > 0 AND "planet_entity_shards"."payload_bytes" <= 1450000)
);
--> statement-breakpoint
CREATE TABLE `planet_events` (
	`world_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision` integer NOT NULL,
	`occurred_at` real NOT NULL,
	`day` real NOT NULL,
	`event_type` text NOT NULL,
	`importance` real NOT NULL,
	`fingerprint` text NOT NULL,
	`event_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`world_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_planet_events_chapter` ON `planet_events` (`world_id`,`day`,`importance`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_planet_events_revision` ON `planet_events` (`world_id`,`revision`,`event_id`);--> statement-breakpoint
CREATE TABLE `planet_history_chapters` (
	`world_id` text NOT NULL,
	`chapter_index` integer NOT NULL,
	`start_day` integer NOT NULL,
	`end_day` integer NOT NULL,
	`through_revision` integer NOT NULL,
	`complete` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`summary_json` text NOT NULL,
	`summary_bytes` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`world_id`, `chapter_index`),
	CONSTRAINT "planet_history_chapters_summary_bound" CHECK("planet_history_chapters"."summary_bytes" > 0 AND "planet_history_chapters"."summary_bytes" <= 1450000)
);
--> statement-breakpoint
CREATE INDEX `idx_planet_history_chapters_revision` ON `planet_history_chapters` (`world_id`,`through_revision`,`chapter_index`);--> statement-breakpoint
CREATE TABLE `planet_region_shards` (
	`world_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`region_key` text NOT NULL,
	`part` integer DEFAULT 0 NOT NULL,
	`revision` integer NOT NULL,
	`chunk_x` integer,
	`chunk_y` integer,
	`payload_json` text NOT NULL,
	`payload_bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`world_id`, `commit_id`, `region_key`, `part`),
	CONSTRAINT "planet_region_shards_payload_bound" CHECK("planet_region_shards"."payload_bytes" > 0 AND "planet_region_shards"."payload_bytes" <= 1450000)
);
--> statement-breakpoint
CREATE INDEX `idx_planet_region_shards_viewport` ON `planet_region_shards` (`world_id`,`commit_id`,`chunk_y`,`chunk_x`);--> statement-breakpoint
CREATE TABLE `planet_settlement_index` (
	`world_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`settlement_id` text NOT NULL,
	`shard_id` text NOT NULL,
	`region_key` text NOT NULL,
	`longitude` real NOT NULL,
	`latitude` real NOT NULL,
	`revision` integer NOT NULL,
	PRIMARY KEY(`world_id`, `commit_id`, `settlement_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_planet_settlement_index_viewport` ON `planet_settlement_index` (`world_id`,`commit_id`,`latitude`,`longitude`);--> statement-breakpoint
CREATE TABLE `planet_settlement_shards` (
	`world_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`shard_id` text NOT NULL,
	`revision` integer NOT NULL,
	`settlement_count` integer NOT NULL,
	`payload_json` text NOT NULL,
	`payload_bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`world_id`, `commit_id`, `shard_id`),
	CONSTRAINT "planet_settlement_shards_payload_bound" CHECK("planet_settlement_shards"."payload_bytes" > 0 AND "planet_settlement_shards"."payload_bytes" <= 1450000)
);
--> statement-breakpoint
CREATE TABLE `planet_worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`era` integer DEFAULT 3 NOT NULL,
	`schema_version` integer NOT NULL,
	`catalog_version` text NOT NULL,
	`seed` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state_revision` integer DEFAULT 0 NOT NULL,
	`current_commit_id` text NOT NULL,
	`manifest_json` text NOT NULL,
	`manifest_bytes` integer NOT NULL,
	`simulated_at_ms` integer NOT NULL,
	`archive_world_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "planet_worlds_era_three" CHECK("planet_worlds"."era" = 3),
	CONSTRAINT "planet_worlds_status" CHECK("planet_worlds"."status" IN ('active', 'paused', 'archived')),
	CONSTRAINT "planet_worlds_manifest_bound" CHECK("planet_worlds"."manifest_bytes" > 0 AND "planet_worlds"."manifest_bytes" <= 1450000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_planet_worlds_era` ON `planet_worlds` (`era`);