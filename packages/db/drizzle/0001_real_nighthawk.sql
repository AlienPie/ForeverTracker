PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_content_record` (
	`resource` text NOT NULL,
	`id` text NOT NULL,
	`build` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`resource`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_content_record`("resource", "id", "build", "data", "fetched_at") SELECT "resource", "id", "build", "data", "fetched_at" FROM `content_record`;--> statement-breakpoint
DROP TABLE `content_record`;--> statement-breakpoint
ALTER TABLE `__new_content_record` RENAME TO `content_record`;--> statement-breakpoint
PRAGMA foreign_keys=ON;