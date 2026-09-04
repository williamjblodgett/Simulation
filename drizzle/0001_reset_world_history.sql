-- One-time, user-requested reset for the canonical autonomous civilization.
-- Remove the permanent ledger first, then the world snapshot. The next normal
-- GET /api/world request creates a fresh Day 1 world and its opening event.
DELETE FROM `civilization_events` WHERE `world_id` = 'canonical';
--> statement-breakpoint
DELETE FROM `civilization_world` WHERE `id` = 'canonical';
