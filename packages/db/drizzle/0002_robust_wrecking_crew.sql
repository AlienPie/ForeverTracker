PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_device_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_device_token`("id", "label", "token_hash", "created_at", "revoked_at") SELECT "id", "label", "token_hash", "created_at", "revoked_at" FROM `device_token`;--> statement-breakpoint
DROP TABLE `device_token`;--> statement-breakpoint
ALTER TABLE `__new_device_token` RENAME TO `device_token`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `device_token_token_hash_unique` ON `device_token` (`token_hash`);