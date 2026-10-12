-- Hide Later Items：Project 与 Area 增加隐藏稍后项的显示状态（默认显示）。
ALTER TABLE "Project" ADD COLUMN "hideLaterItems" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Area" ADD COLUMN "hideLaterItems" BOOLEAN NOT NULL DEFAULT false;
