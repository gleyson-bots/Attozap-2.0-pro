CREATE TABLE `whatsapp_accounts` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`accountLabel` varchar(80) NOT NULL,
	`phoneNumber` varchar(32),
	`status` enum('active','paused','disconnected') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_accounts_user_label_unique` UNIQUE(`userId`,`accountLabel`)
);
--> statement-breakpoint
ALTER TABLE `ai_agent_configs` ADD `waAccountId` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_agent_configs` ADD CONSTRAINT `ai_agent_user_account_id_unique` UNIQUE(`userId`,`waAccountId`);--> statement-breakpoint
ALTER TABLE `whatsapp_accounts` ADD CONSTRAINT `whatsapp_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `whatsapp_accounts_user_status_idx` ON `whatsapp_accounts` (`userId`,`status`);--> statement-breakpoint
ALTER TABLE `ai_agent_configs` ADD CONSTRAINT `ai_agent_configs_waAccountId_whatsapp_accounts_id_fk` FOREIGN KEY (`waAccountId`) REFERENCES `whatsapp_accounts`(`id`) ON DELETE cascade ON UPDATE no action;