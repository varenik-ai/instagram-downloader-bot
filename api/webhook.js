import https from "https";
import http from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

const BOT_TOKEN = process.env.BOT_TOKEN;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || "10");
const ADMIN_ID = 2120086742;
const COUNTERS_FILE = join(tmpdir(), "counters_ig.json");

function getCounters() {
  try {
    if (existsSync(COUNTERS_FILE)) return JSON.parse(readFileSync(COUNTERS_FILE, "utf8"));
  } catch {}
  return {};
}

function saveCounters(data) {
  try { writeFileSync(COUNTERS_FILE, JSON.stringify(data), "utf8"); } catch {}
}

function checkLimit(userId) {
  const counters = getCounters();
  const today = new Date().toISOString().slice(0, 10);
  const key = `${userId}_${today}`;
  const count = counters[key] || 0;
  if (count >= DAILY_LIMIT) return false;
  counters[key] = count + 1;
  saveCounters(counters);
  return true;
}

function tgRequest(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    };
    const req = https.request(options, res => {
      let buf = "";
      res.on("data", c => buf += c);
      res.on("end", () => resolve(JSON.parse(buf)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function sendMessage(chatId, text, extra = {}) {
  return tgRequest("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

function deleteMessage(chatId, messageId) {
  return tgRequest("deleteMessage", { chat_id: chatId, message_id: messageId });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Referer": "https://www.instagram.com/"
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.end();
  });
}

function sendVideoBuffer(chatId, buffer, caption) {
  return new Promise((resolve, reject) => {
    const boundary = randomBytes(16).toString("hex");
    const part1 = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="supports_streaming"\r\n\r\ntrue\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`
    );
    const part2 = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([part1, buffer, part2]);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length
      }
    };
    const req = https.request(options, res => {
      let buf = "";
      res.on("data", c => buf += c);
      res.on("end", () => resolve(JSON.parse(buf)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sendPhotoBuffer(chatId, buffer, caption) {
  return new Promise((resolve, reject) => {
    const boundary = randomBytes(16).toString("hex");
    const part1 = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    );
    const part2 = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([part1, buffer, part2]);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/sendPhoto`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length
      }
    };
    const req = https.request(options, res => {
      let buf = "";
      res.on("data", c => buf += c);
      res.on("end", () => resolve(JSON.parse(buf)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getInstagramMedia(url) {
  return new Promise((resolve, reject) => {
    const encodedUrl = encodeURIComponent(url);
    const options = {
      hostname: "insta-reels-downloader-the-fastest-hd-reels-fetcher-api.p.rapidapi.com",
      path: `/unified/index?url=${encodedUrl}`,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": "insta-reels-downloader-the-fastest-hd-reels-fetcher-api.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY
      }
    };
    const req = https.request(options, res => {
      let buf = "";
      res.on("data", c => buf += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(buf);
          // Уведомляем админа если лимит исчерпан
          if (json.message && json.message.includes("limit")) {
            sendMessage(ADMIN_ID, `⚠️ <b>Instagram Bot</b>\n\nRapidAPI лимит исчерпан!\nПополни план на rapidapi.com`);
          }
          if (json.success) resolve(json);
          else reject(new Error(json.message || "API error"));
        } catch { reject(new Error("Parse error: " + buf.slice(0, 100))); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  const message = update?.message;
  if (!message) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const userId = message.from.id;
  const lang = message.from?.language_code || "en";
  const isRu = lang.startsWith("ru") || lang.startsWith("uk") || lang.startsWith("be");
  const text = message.text?.trim() || "";

  if (text === "/start") {
    await sendMessage(chatId,
      isRu
        ? `👋 <b>Привет!</b>\n\nЯ скачиваю Reels, посты и Stories из Instagram <b>без водяного знака</b>.\n\nОтправь мне ссылку — и я пришлю медиафайл.\n\n📎 Пример:\n<code>https://www.instagram.com/reel/ABC123/</code>`
        : `👋 <b>Hello!</b>\n\nI download Instagram Reels, Posts & Stories <b>without watermark</b>.\n\nSend me a link and I'll send you the media file.\n\n📎 Example:\n<code>https://www.instagram.com/reel/ABC123/</code>`
    );
    return res.status(200).json({ ok: true });
  }

  const isInstagram = text.includes("instagram.com") || text.includes("instagr.am");
  if (!isInstagram) {
    await sendMessage(chatId,
      isRu
        ? "❌ Отправь ссылку на пост, Reel или Story из Instagram.\n\nПример:\n<code>https://www.instagram.com/reel/ABC123/</code>"
        : "❌ Send an Instagram post, Reel or Story link.\n\nExample:\n<code>https://www.instagram.com/reel/ABC123/</code>"
    );
    return res.status(200).json({ ok: true });
  }

  if (!checkLimit(userId)) {
    await sendMessage(chatId,
      isRu
        ? `⛔ <b>Лимит на сегодня исчерпан</b>\n\nБесплатно доступно ${DAILY_LIMIT} скачиваний в день.\nВозвращайся завтра! 🌅`
        : `⛔ <b>Daily limit reached</b>\n\n${DAILY_LIMIT} free downloads per day.\nCome back tomorrow! 🌅`
    );
    return res.status(200).json({ ok: true });
  }

  const waitMsg = await sendMessage(chatId,
    isRu ? "⏳ Скачиваю медиа, подожди секунду..." : "⏳ Downloading, please wait..."
  );
  const waitMsgId = waitMsg?.result?.message_id;

  try {
    const json = await getInstagramMedia(text);
    const mediaType = json.media_type;
    const content = json.data?.content;
    const caption = isRu
      ? "❤️ Скачано @insta_save_pro_bot"
      : "❤️ Downloaded by @insta_save_pro_bot";

    // Получаем список медиафайлов
    let items = [];
    if (mediaType === "sidecar" && content?.items) {
      items = content.items;
    } else if (content?.media_url) {
      items = [{ type: mediaType === "video" ? "video" : "photo", media_url: content.media_url }];
    }

    if (items.length === 0) throw new Error("No media found");

    if (waitMsgId) await deleteMessage(chatId, waitMsgId);

    // Отправляем первый медиафайл
    const item = items[0];
    const isVideo = item.type === "video";
    const buffer = await downloadBuffer(item.media_url);
    const fileSizeMb = buffer.length / (1024 * 1024);

    if (isVideo) {
      if (fileSizeMb > 50) {
        await sendMessage(chatId,
          isRu
            ? `❌ Видео слишком большое (${fileSizeMb.toFixed(1)} МБ). Telegram принимает до 50 МБ.`
            : `❌ Video is too large (${fileSizeMb.toFixed(1)} MB). Telegram supports up to 50 MB.`
        );
      } else {
        const result = await sendVideoBuffer(chatId, buffer, caption);
        if (!result?.ok) {
          await sendMessage(chatId, isRu ? "❌ Не удалось отправить видео." : "❌ Failed to send video.");
        }
      }
    } else {
      const result = await sendPhotoBuffer(chatId, buffer, caption);
      if (!result?.ok) {
        await sendMessage(chatId, isRu ? "❌ Не удалось отправить фото." : "❌ Failed to send photo.");
      }
    }

    // Если карусель — сообщаем сколько ещё файлов
    if (items.length > 1) {
      await sendMessage(chatId,
        isRu
          ? `📎 В этом посте ещё ${items.length - 1} файл(ов). Отправь ссылку ещё раз чтобы получить следующий.`
          : `📎 This post has ${items.length - 1} more file(s).`
      );
    }

  } catch (err) {
    if (waitMsgId) await deleteMessage(chatId, waitMsgId);
    await sendMessage(chatId,
      isRu
        ? `❌ <b>Не удалось скачать медиа</b>\n\nВозможные причины:\n• Аккаунт приватный\n• Неверная ссылка\n• Попробуй ещё раз через минуту`
        : `❌ <b>Failed to download media</b>\n\nPossible reasons:\n• Private account\n• Invalid link\n• Try again in a minute`
    );
  }

  return res.status(200).json({ ok: true });
}
