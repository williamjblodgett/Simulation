CREATE TABLE `planet_reconstruction_state` (
	`world_id` text PRIMARY KEY NOT NULL,
	`resolution` text DEFAULT 'exact' NOT NULL,
	`coverage_from_day` real DEFAULT 1 NOT NULL,
	`coarse_epoch_days` real,
	`target_simulated_at_ms` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "planet_reconstruction_resolution" CHECK("planet_reconstruction_state"."resolution" IN ('exact', 'mixed', 'coarse'))
);
