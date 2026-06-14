-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "DishPreferenceLevel" AS ENUM ('love', 'like', 'avoid');

-- CreateEnum
CREATE TYPE "IngredientPreferenceLevel" AS ENUM ('love', 'like', 'avoid', 'allergic');

-- CreateTable
CREATE TABLE "BrunchStatus" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchDecisionType" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchDecisionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RsvpStatus" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "countsAsAttendee" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RsvpStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchInviteSuggestionStatus" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchInviteSuggestionStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationType" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" UUID,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuthProvider" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAuthProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notificationTypeId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFeatureFlag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "featureFlagId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" UUID NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isUserOverridable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notificationTypeId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "brunchId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brunch" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hostId" UUID NOT NULL,
    "statusId" UUID NOT NULL,
    "votingDeadline" TIMESTAMP(3),
    "allowInviteSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "requireHostApprovalToInvite" BOOLEAN NOT NULL DEFAULT true,
    "allowLocationSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "allowTimeSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "hostTransferredAt" TIMESTAMP(3),
    "hostTransferredFromId" UUID,
    "cancellationJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" UUID,

    CONSTRAINT "Brunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchInvite" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "invitedUserId" UUID,
    "invitedEmail" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastResentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "BrunchInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchAttendee" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "inviteId" UUID NOT NULL,
    "rsvpStatusId" UUID NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "arrivingLate" BOOLEAN NOT NULL DEFAULT false,
    "leavingEarly" BOOLEAN NOT NULL DEFAULT false,
    "dietaryNote" TEXT,
    "decideBy" TIMESTAMP(3),
    "regretNote" TEXT,
    "inviteNextTime" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "BrunchAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchInviteSuggestion" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "suggestedById" UUID NOT NULL,
    "suggestedEmail" TEXT NOT NULL,
    "suggestedUserId" UUID,
    "statusId" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchInviteSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchLocation" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "decisionTypeId" UUID NOT NULL,
    "placeId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "placeAddress" TEXT NOT NULL,
    "placeUrl" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "proposedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "BrunchLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchTime" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "decisionTypeId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "proposedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "BrunchTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchLocationVote" (
    "id" UUID NOT NULL,
    "brunchLocationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchLocationVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrunchTimeVote" (
    "id" UUID NOT NULL,
    "brunchTimeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrunchTimeVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "brunchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendshipStatus" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendshipStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "statusId" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "blockedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendGroup" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "FriendGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendGroupMember" (
    "id" UUID NOT NULL,
    "friendGroupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "FriendGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavoritePlace" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "placeId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "placeAddress" TEXT NOT NULL,
    "placeUrl" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "UserFavoritePlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDishPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "preference" "DishPreferenceLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDishPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIngredientPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "preference" "IngredientPreferenceLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIngredientPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrunchStatus_code_key" ON "BrunchStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchDecisionType_code_key" ON "BrunchDecisionType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RsvpStatus_code_key" ON "RsvpStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchInviteSuggestionStatus_code_key" ON "BrunchInviteSuggestionStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationType_code_key" ON "NotificationType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannel_code_key" ON "NotificationChannel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "UserAuthProvider_userId_idx" ON "UserAuthProvider"("userId");

-- CreateIndex
CREATE INDEX "UserAuthProvider_providerUserId_idx" ON "UserAuthProvider"("providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAuthProvider_provider_providerUserId_key" ON "UserAuthProvider"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "UserNotificationPreference_userId_idx" ON "UserNotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_notificationTypeId_channe_key" ON "UserNotificationPreference"("userId", "notificationTypeId", "channelId");

-- CreateIndex
CREATE INDEX "UserFeatureFlag_userId_idx" ON "UserFeatureFlag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFeatureFlag_userId_featureFlagId_key" ON "UserFeatureFlag"("userId", "featureFlagId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_changedBy_idx" ON "AuditLog"("changedBy");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_code_key" ON "FeatureFlag"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_brunchId_idx" ON "Notification"("brunchId");

-- CreateIndex
CREATE INDEX "Brunch_hostId_idx" ON "Brunch"("hostId");

-- CreateIndex
CREATE INDEX "Brunch_statusId_idx" ON "Brunch"("statusId");

-- CreateIndex
CREATE INDEX "Brunch_deletedAt_idx" ON "Brunch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchInvite_token_key" ON "BrunchInvite"("token");

-- CreateIndex
CREATE INDEX "BrunchInvite_brunchId_idx" ON "BrunchInvite"("brunchId");

-- CreateIndex
CREATE INDEX "BrunchInvite_token_idx" ON "BrunchInvite"("token");

-- CreateIndex
CREATE INDEX "BrunchInvite_invitedUserId_idx" ON "BrunchInvite"("invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchAttendee_inviteId_key" ON "BrunchAttendee"("inviteId");

-- CreateIndex
CREATE INDEX "BrunchAttendee_brunchId_idx" ON "BrunchAttendee"("brunchId");

-- CreateIndex
CREATE INDEX "BrunchAttendee_userId_idx" ON "BrunchAttendee"("userId");

-- CreateIndex
CREATE INDEX "BrunchAttendee_rsvpStatusId_idx" ON "BrunchAttendee"("rsvpStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchAttendee_brunchId_userId_key" ON "BrunchAttendee"("brunchId", "userId");

-- CreateIndex
CREATE INDEX "BrunchInviteSuggestion_brunchId_idx" ON "BrunchInviteSuggestion"("brunchId");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchInviteSuggestion_brunchId_suggestedEmail_key" ON "BrunchInviteSuggestion"("brunchId", "suggestedEmail");

-- CreateIndex
CREATE INDEX "BrunchLocation_brunchId_idx" ON "BrunchLocation"("brunchId");

-- CreateIndex
CREATE INDEX "BrunchLocation_isConfirmed_idx" ON "BrunchLocation"("isConfirmed");

-- CreateIndex
CREATE INDEX "BrunchTime_brunchId_idx" ON "BrunchTime"("brunchId");

-- CreateIndex
CREATE INDEX "BrunchTime_scheduledAt_idx" ON "BrunchTime"("scheduledAt");

-- CreateIndex
CREATE INDEX "BrunchTime_isConfirmed_idx" ON "BrunchTime"("isConfirmed");

-- CreateIndex
CREATE INDEX "BrunchLocationVote_brunchLocationId_idx" ON "BrunchLocationVote"("brunchLocationId");

-- CreateIndex
CREATE INDEX "BrunchLocationVote_userId_idx" ON "BrunchLocationVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchLocationVote_brunchLocationId_userId_key" ON "BrunchLocationVote"("brunchLocationId", "userId");

-- CreateIndex
CREATE INDEX "BrunchTimeVote_brunchTimeId_idx" ON "BrunchTimeVote"("brunchTimeId");

-- CreateIndex
CREATE INDEX "BrunchTimeVote_userId_idx" ON "BrunchTimeVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrunchTimeVote_brunchTimeId_userId_key" ON "BrunchTimeVote"("brunchTimeId", "userId");

-- CreateIndex
CREATE INDEX "Message_brunchId_idx" ON "Message"("brunchId");

-- CreateIndex
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendshipStatus_code_key" ON "FriendshipStatus"("code");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_idx" ON "Friendship"("requesterId");

-- CreateIndex
CREATE INDEX "Friendship_recipientId_idx" ON "Friendship"("recipientId");

-- CreateIndex
CREATE INDEX "Friendship_statusId_idx" ON "Friendship"("statusId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_recipientId_key" ON "Friendship"("requesterId", "recipientId");

-- CreateIndex
CREATE INDEX "FriendGroup_ownerId_idx" ON "FriendGroup"("ownerId");

-- CreateIndex
CREATE INDEX "FriendGroupMember_friendGroupId_idx" ON "FriendGroupMember"("friendGroupId");

-- CreateIndex
CREATE INDEX "FriendGroupMember_userId_idx" ON "FriendGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendGroupMember_friendGroupId_userId_key" ON "FriendGroupMember"("friendGroupId", "userId");

-- CreateIndex
CREATE INDEX "UserFavoritePlace_userId_idx" ON "UserFavoritePlace"("userId");

-- CreateIndex
CREATE INDEX "UserFavoritePlace_placeId_idx" ON "UserFavoritePlace"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavoritePlace_userId_placeId_key" ON "UserFavoritePlace"("userId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_code_key" ON "Dish"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_code_key" ON "Ingredient"("code");

-- CreateIndex
CREATE INDEX "UserDishPreference_userId_idx" ON "UserDishPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDishPreference_userId_dishId_key" ON "UserDishPreference"("userId", "dishId");

-- CreateIndex
CREATE INDEX "UserIngredientPreference_userId_idx" ON "UserIngredientPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIngredientPreference_userId_ingredientId_key" ON "UserIngredientPreference"("userId", "ingredientId");

-- AddForeignKey
ALTER TABLE "UserAuthProvider" ADD CONSTRAINT "UserAuthProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_notificationTypeId_fkey" FOREIGN KEY ("notificationTypeId") REFERENCES "NotificationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeatureFlag" ADD CONSTRAINT "UserFeatureFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeatureFlag" ADD CONSTRAINT "UserFeatureFlag_featureFlagId_fkey" FOREIGN KEY ("featureFlagId") REFERENCES "FeatureFlag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_notificationTypeId_fkey" FOREIGN KEY ("notificationTypeId") REFERENCES "NotificationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brunch" ADD CONSTRAINT "Brunch_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brunch" ADD CONSTRAINT "Brunch_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "BrunchStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brunch" ADD CONSTRAINT "Brunch_hostTransferredFromId_fkey" FOREIGN KEY ("hostTransferredFromId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInvite" ADD CONSTRAINT "BrunchInvite_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInvite" ADD CONSTRAINT "BrunchInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInvite" ADD CONSTRAINT "BrunchInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchAttendee" ADD CONSTRAINT "BrunchAttendee_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchAttendee" ADD CONSTRAINT "BrunchAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchAttendee" ADD CONSTRAINT "BrunchAttendee_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "BrunchInvite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchAttendee" ADD CONSTRAINT "BrunchAttendee_rsvpStatusId_fkey" FOREIGN KEY ("rsvpStatusId") REFERENCES "RsvpStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInviteSuggestion" ADD CONSTRAINT "BrunchInviteSuggestion_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInviteSuggestion" ADD CONSTRAINT "BrunchInviteSuggestion_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInviteSuggestion" ADD CONSTRAINT "BrunchInviteSuggestion_suggestedUserId_fkey" FOREIGN KEY ("suggestedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInviteSuggestion" ADD CONSTRAINT "BrunchInviteSuggestion_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "BrunchInviteSuggestionStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchInviteSuggestion" ADD CONSTRAINT "BrunchInviteSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocation" ADD CONSTRAINT "BrunchLocation_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocation" ADD CONSTRAINT "BrunchLocation_decisionTypeId_fkey" FOREIGN KEY ("decisionTypeId") REFERENCES "BrunchDecisionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocation" ADD CONSTRAINT "BrunchLocation_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTime" ADD CONSTRAINT "BrunchTime_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTime" ADD CONSTRAINT "BrunchTime_decisionTypeId_fkey" FOREIGN KEY ("decisionTypeId") REFERENCES "BrunchDecisionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTime" ADD CONSTRAINT "BrunchTime_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocationVote" ADD CONSTRAINT "BrunchLocationVote_brunchLocationId_fkey" FOREIGN KEY ("brunchLocationId") REFERENCES "BrunchLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchLocationVote" ADD CONSTRAINT "BrunchLocationVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTimeVote" ADD CONSTRAINT "BrunchTimeVote_brunchTimeId_fkey" FOREIGN KEY ("brunchTimeId") REFERENCES "BrunchTime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrunchTimeVote" ADD CONSTRAINT "BrunchTimeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_brunchId_fkey" FOREIGN KEY ("brunchId") REFERENCES "Brunch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "FriendshipStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendGroup" ADD CONSTRAINT "FriendGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendGroupMember" ADD CONSTRAINT "FriendGroupMember_friendGroupId_fkey" FOREIGN KEY ("friendGroupId") REFERENCES "FriendGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendGroupMember" ADD CONSTRAINT "FriendGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendGroupMember" ADD CONSTRAINT "FriendGroupMember_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoritePlace" ADD CONSTRAINT "UserFavoritePlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDishPreference" ADD CONSTRAINT "UserDishPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDishPreference" ADD CONSTRAINT "UserDishPreference_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIngredientPreference" ADD CONSTRAINT "UserIngredientPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIngredientPreference" ADD CONSTRAINT "UserIngredientPreference_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
