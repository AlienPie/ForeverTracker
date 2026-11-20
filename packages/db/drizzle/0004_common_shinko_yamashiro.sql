CREATE TABLE `manual_completion` (
	`guid` text NOT NULL,
	`quest_id` integer NOT NULL,
	`marked_at` integer NOT NULL,
	PRIMARY KEY(`guid`, `quest_id`)
);
