CREATE TABLE `ai_agent_configs` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`waAccount` varchar(80) NOT NULL,
	`provider` enum('openai','anthropic','groq','openrouter','nvidia_nim','xai','pollinations','huggingface') NOT NULL,
	`model` varchar(160) NOT NULL,
	`temperature` decimal(3,2) NOT NULL DEFAULT '0.70',
	`systemPrompt` text NOT NULL,
	`mode` enum('reply','reactivation','qualification','hybrid') NOT NULL DEFAULT 'reply',
	`apiKeyEncrypted` text,
	`apiKeyLast4` varchar(4),
	`active` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_agent_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_agent_user_account_unique` UNIQUE(`userId`,`waAccount`)
);
--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` varchar(36) NOT NULL,
	`version` varchar(64) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(1024) NOT NULL,
	`releaseNotes` text,
	`allowedPlans` json NOT NULL,
	`isPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` int NOT NULL,
	CONSTRAINT `downloads_id` PRIMARY KEY(`id`),
	CONSTRAINT `downloads_version_filename_unique` UNIQUE(`version`,`filename`)
);
--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`planId` varchar(32) NOT NULL,
	`status` enum('active','expiring','expired','suspended','revoked') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`licenseKeyHash` varchar(128) NOT NULL,
	`licenseKeyHint` varchar(24) NOT NULL,
	`renewalKeyHash` varchar(128),
	`renewalKeyHint` varchar(24),
	`deviceFingerprint` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `licenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `licenses_licenseKeyHash_unique` UNIQUE(`licenseKeyHash`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`maxAccounts` int,
	`priceCents` int,
	`features` json NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `renewals` (
	`id` varchar(36) NOT NULL,
	`licenseId` varchar(36) NOT NULL,
	`renewedAt` timestamp NOT NULL DEFAULT (now()),
	`renewalKeyHash` varchar(128),
	`daysAdded` int NOT NULL,
	`note` varchar(500),
	CONSTRAINT `renewals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_agent_configs` ADD CONSTRAINT `ai_agent_configs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `downloads` ADD CONSTRAINT `downloads_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `licenses` ADD CONSTRAINT `licenses_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `licenses` ADD CONSTRAINT `licenses_planId_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `renewals` ADD CONSTRAINT `renewals_licenseId_licenses_id_fk` FOREIGN KEY (`licenseId`) REFERENCES `licenses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_agent_user_active_idx` ON `ai_agent_configs` (`userId`,`active`);--> statement-breakpoint
CREATE INDEX `downloads_published_created_idx` ON `downloads` (`isPublished`,`createdAt`);--> statement-breakpoint
CREATE INDEX `licenses_user_status_idx` ON `licenses` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `licenses_expires_at_idx` ON `licenses` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `renewals_license_renewed_idx` ON `renewals` (`licenseId`,`renewedAt`);