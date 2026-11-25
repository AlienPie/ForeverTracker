CREATE TABLE `api_snapshot` (
	`guid` text PRIMARY KEY NOT NULL,
	`fetched_at` integer NOT NULL,
	`last_modified` integer,
	`data` text NOT NULL
);
