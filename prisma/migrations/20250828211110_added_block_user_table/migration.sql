-- CreateTable
CREATE TABLE "public"."BlockedUsers" (
    "id" TEXT NOT NULL,
    "blockerId" INTEGER NOT NULL,
    "blockedId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockedUsers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedUsers_blockedId_idx" ON "public"."BlockedUsers"("blockedId");

-- AddForeignKey
ALTER TABLE "public"."BlockedUsers" ADD CONSTRAINT "BlockedUsers_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BlockedUsers" ADD CONSTRAINT "BlockedUsers_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
