ALTER TABLE `bookings` DROP INDEX `bookings_slot_unique`;--> statement-breakpoint
ALTER TABLE `bookings` ADD `activeSlot` varchar(40) GENERATED ALWAYS AS ((case when `paymentStatus` in ('pending','paid') then concat(`courtId`,'|',`playerDate`,'|',`startHour`) else null end)) STORED;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_active_slot_unique` UNIQUE(`activeSlot`);