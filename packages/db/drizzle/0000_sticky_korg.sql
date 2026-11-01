CREATE TABLE `character` (
	`guid` text PRIMARY KEY NOT NULL,
	`name` text,
	`class` text,
	`race` text,
	`level` integer,
	`first_seen_at` integer NOT NULL,
	`latest_taken_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_record` (
	`resource` text NOT NULL,
	`id` integer NOT NULL,
	`build` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`resource`, `id`)
);
--> statement-breakpoint
CREATE TABLE `device_token` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_token_token_hash_unique` ON `device_token` (`token_hash`);--> statement-breakpoint
CREATE TABLE `snapshot` (
	`guid` text NOT NULL,
	`taken_at` integer NOT NULL,
	`build` text NOT NULL,
	`schema` integer NOT NULL,
	`raw` text NOT NULL,
	`unsupported` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`guid`, `taken_at`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`resource` text PRIMARY KEY NOT NULL,
	`build` text NOT NULL,
	`next_offset` integer DEFAULT 0 NOT NULL,
	`total` integer,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL
);
