-- Android 后台同步（local-first-v3 issue 09）：设备的只读后台凭据。
-- 只允许读提醒计划，存 SHA-256；设备注册时轮换并续期。
ALTER TABLE "Device" ADD COLUMN "backgroundTokenHash" TEXT;
ALTER TABLE "Device" ADD COLUMN "backgroundTokenExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Device_backgroundTokenHash_key" ON "Device"("backgroundTokenHash");
