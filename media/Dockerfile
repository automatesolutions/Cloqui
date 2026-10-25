# Cloqui media worker: makes playback files and thumbnails for uploaded videos.
# Runs as a Cloud Run Job with --once (drain the queue, then exit), started on a schedule.
# Build from the repo root:  docker build -f media/Dockerfile -t cloqui-media .

FROM node:22-slim
WORKDIR /app
# System ffmpeg instead of ffmpeg-static: smaller, and patched by the distro.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY media ./media
ENV NODE_ENV=production FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe
RUN groupadd --system app && useradd --system --gid app app
USER app
CMD ["node", "--experimental-strip-types", "--no-warnings=ExperimentalWarning", "media/worker.ts", "--once"]
