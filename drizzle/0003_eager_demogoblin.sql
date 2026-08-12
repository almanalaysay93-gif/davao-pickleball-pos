CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`message` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`expireAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
