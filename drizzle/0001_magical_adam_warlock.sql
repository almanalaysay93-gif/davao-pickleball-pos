CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reference` varchar(16) NOT NULL,
	`courtId` int NOT NULL,
	`venueId` int NOT NULL,
	`playerDate` varchar(10) NOT NULL,
	`startHour` varchar(5) NOT NULL,
	`endHour` varchar(5) NOT NULL,
	`playerName` varchar(128) NOT NULL,
	`contact` varchar(64),
	`channel` enum('online','walkin') NOT NULL DEFAULT 'online',
	`paymentStatus` enum('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
	`paymentMethod` varchar(32),
	`dayAmount` decimal(10,2) DEFAULT '0',
	`nightAmount` decimal(10,2) DEFAULT '0',
	`totalAmount` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookings_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `courts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`courtNumber` varchar(16) NOT NULL,
	`status` enum('available','maintenance') NOT NULL DEFAULT 'available',
	CONSTRAINT `courts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rateTiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`tierName` enum('daytime','nighttime') NOT NULL,
	`startHour` varchar(5) NOT NULL,
	`endHour` varchar(5) NOT NULL,
	`pricePerHour` decimal(10,2) NOT NULL,
	CONSTRAINT `rateTiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`address` text NOT NULL,
	`district` varchar(64),
	`courtCount` int NOT NULL DEFAULT 1,
	`surfaceType` enum('indoor','outdoor','covered') NOT NULL DEFAULT 'indoor',
	`openTime` varchar(5) NOT NULL,
	`closeTime` varchar(5) NOT NULL,
	`phone` varchar(32),
	`description` text,
	`imageKey` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venues_id` PRIMARY KEY(`id`)
);
