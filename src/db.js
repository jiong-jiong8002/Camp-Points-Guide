'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS points (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    region      TEXT NOT NULL DEFAULT '',
    type        TEXT NOT NULL DEFAULT 'building',
    risk        TEXT NOT NULL DEFAULT '中',
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tips        TEXT NOT NULL DEFAULT '[]',
    images      TEXT NOT NULL DEFAULT '[]',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
`);

function parseArray(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function rowToPoint(row) {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    type: row.type,
    risk: row.risk,
    x: row.x,
    y: row.y,
    desc: row.description,
    tips: parseArray(row.tips),
    images: parseArray(row.images),
    createdAt: row.created_at
  };
}

function listPoints() {
  const rows = db.prepare(
    'SELECT * FROM points ORDER BY created_at DESC'
  ).all();
  return rows.map(rowToPoint);
}

function getPoint(id) {
  const row = db.prepare('SELECT * FROM points WHERE id = ?').get(id);
  return row ? rowToPoint(row) : null;
}

function createPoint(fields) {
  const now = Date.now();
  const id = 'p_' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO points (id, name, region, type, risk, x, y, description, tips, images, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fields.name,
    fields.region,
    fields.type,
    fields.risk,
    fields.x,
    fields.y,
    fields.desc,
    JSON.stringify(fields.tips),
    JSON.stringify(fields.images),
    now,
    now
  );
  return getPoint(id);
}

function updatePoint(id, fields) {
  db.prepare(`
    UPDATE points
       SET name = ?, region = ?, type = ?, risk = ?, x = ?, y = ?,
           description = ?, tips = ?, images = ?, updated_at = ?
     WHERE id = ?
  `).run(
    fields.name,
    fields.region,
    fields.type,
    fields.risk,
    fields.x,
    fields.y,
    fields.desc,
    JSON.stringify(fields.tips),
    JSON.stringify(fields.images),
    Date.now(),
    id
  );
  return getPoint(id);
}

function deletePoint(id) {
  const result = db.prepare('DELETE FROM points WHERE id = ?').run(id);
  return result.changes > 0;
}

function saveImageDataUrl(dataUrl) {
  const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  const name = crypto.randomUUID() + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

function removeImageFile(url) {
  if (typeof url !== 'string' || url.indexOf('/uploads/') !== 0) return;
  const name = path.basename(url);
  const target = path.join(UPLOAD_DIR, name);
  if (target.indexOf(UPLOAD_DIR) !== 0) return;
  fs.rm(target, { force: true }, () => {});
}

module.exports = {
  listPoints,
  getPoint,
  createPoint,
  updatePoint,
  deletePoint,
  saveImageDataUrl,
  removeImageFile,
  UPLOAD_DIR,
  DATA_DIR
};
