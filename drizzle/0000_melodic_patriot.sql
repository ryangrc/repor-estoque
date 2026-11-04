CREATE TABLE `auditLogs` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`before` text,
	`after` text,
	`note` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passwordResetTokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`categoryId` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`quantity` real NOT NULL,
	`minimum` real NOT NULL,
	`ideal` real NOT NULL,
	`unit` text NOT NULL,
	`manualStatus` text,
	`note` text DEFAULT '' NOT NULL,
	`flagged` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`updatedBy` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_name_unique` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `roles` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`csrf` text NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_user` ON `sessions` (`userId`);--> statement-breakpoint
CREATE TABLE `setup` (
	`id` integer PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shoppingListItems` (
	`id` text PRIMARY KEY NOT NULL,
	`listId` text NOT NULL,
	`productId` text NOT NULL,
	`quantity` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`purchased` integer DEFAULT 0 NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`addedBy` text NOT NULL,
	`addedAt` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`listId`) REFERENCES `shoppingLists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`addedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_product` ON `shoppingListItems` (`listId`,`productId`);--> statement-breakpoint
CREATE TABLE `shoppingLists` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`finalizedAt` text,
	`finalizedBy` text,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`finalizedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_open_list` ON `shoppingLists` (`status`) WHERE status = 'open';--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`id` text PRIMARY KEY NOT NULL,
	`productId` text NOT NULL,
	`userId` text NOT NULL,
	`before` real NOT NULL,
	`after` real NOT NULL,
	`difference` real NOT NULL,
	`reason` text NOT NULL,
	`note` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`passwordHash` text,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`job` text DEFAULT '' NOT NULL,
	`canUpdateStock` integer DEFAULT 1 NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`role`) REFERENCES `roles`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);