-- Feed Position：项目行在 feed 视图中与任务混排的位次（feed-project-ordering spec）
ALTER TABLE "Project" ADD COLUMN "feedPosition" TEXT;
