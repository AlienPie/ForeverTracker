CREATE TABLE `hidden_place` (
	`guid` text NOT NULL,
	`map_id` integer NOT NULL,
	`hidden_at` integer NOT NULL,
	PRIMARY KEY(`guid`, `map_id`)
);
