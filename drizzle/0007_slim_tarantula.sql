CREATE TABLE `venueGallery` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`imageKey` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venueGallery_id` PRIMARY KEY(`id`)
);
