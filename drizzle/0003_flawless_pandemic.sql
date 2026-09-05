CREATE TABLE `planet_ai_counsel_log` (
	`world_id` text NOT NULL,
	`run_id` text NOT NULL,
	`world_revision` integer NOT NULL,
	`day` real NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`agent_ids_json` text NOT NULL,
	`decisions_json` text NOT NULL,
	`payload_bytes` integer NOT NULL,
	`request_id` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`world_id`, `run_id`),
	CONSTRAINT "planet_ai_counsel_log_status" CHECK("planet_ai_counsel_log"."status" IN ('applied', 'rejected', 'failed')),
	CONSTRAINT "planet_ai_counsel_log_payload_bound" CHECK("planet_ai_counsel_log"."payload_bytes" >= 2 AND "planet_ai_counsel_log"."payload_bytes" <= 24000)
);
--> statement-breakpoint
CREATE INDEX `idx_planet_ai_counsel_log_day` ON `planet_ai_counsel_log` (`world_id`,`day`,`run_id`);--> statement-breakpoint
CREATE TABLE `planet_ai_counsel_state` (
	`world_id` text PRIMARY KEY NOT NULL,
	`lease_until_ms` integer DEFAULT 0 NOT NULL,
	`last_started_day` real DEFAULT -1000000 NOT NULL,
	`last_completed_day` real DEFAULT -1000000 NOT NULL,
	`daily_bucket` integer DEFAULT 0 NOT NULL,
	`daily_calls` integer DEFAULT 0 NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_request_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "planet_ai_counsel_daily_calls_bound" CHECK("planet_ai_counsel_state"."daily_calls" >= 0 AND "planet_ai_counsel_state"."daily_calls" <= 24),
	CONSTRAINT "planet_ai_counsel_failures_bound" CHECK("planet_ai_counsel_state"."consecutive_failures" >= 0 AND "planet_ai_counsel_state"."consecutive_failures" <= 1000)
);
