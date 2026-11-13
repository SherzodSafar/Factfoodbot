FROM node:22-bookworm-slim

# ffmpeg — kadr ajratish, yt-dlp — Instagram/YouTube/TikTok videolarini yuklab olish
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
 && chmod +x /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src

ENV NODE_ENV=production FFMPEG_PATH=ffmpeg YTDLP_PATH=/usr/local/bin/yt-dlp
CMD ["node", "src/index.js"]
