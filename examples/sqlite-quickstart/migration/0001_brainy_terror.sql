CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
