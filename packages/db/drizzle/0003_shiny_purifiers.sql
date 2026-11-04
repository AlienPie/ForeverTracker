CREATE TABLE `character_event` (
	`guid` text NOT NULL,
	`t` integer NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`guid`, `t`, `kind`, `data`)
);
--> statement-breakpoint
ALTER TABLE `character` ADD `extras` text;