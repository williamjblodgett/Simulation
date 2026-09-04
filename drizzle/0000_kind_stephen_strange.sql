CREATE TABLE `civilization_events` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`revision` integer NOT NULL,
	`occurred_at_ms` integer NOT NULL,
	`event_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `civilization_world`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_civilization_events_world_occurred` ON `civilization_events` (`world_id`,`occurred_at_ms`,`id`);--> statement-breakpoint
CREATE TABLE `civilization_world` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state_json` text NOT NULL,
	`simulated_at_ms` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "civilization_world_canonical_id" CHECK("civilization_world"."id" = 'canonical')
);
