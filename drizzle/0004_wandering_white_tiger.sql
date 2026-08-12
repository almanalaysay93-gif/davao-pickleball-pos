CREATE TABLE `customerAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(128),
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerAccounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `ownerCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ownerCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `ownerCredentials_username_unique` UNIQUE(`username`)
);
