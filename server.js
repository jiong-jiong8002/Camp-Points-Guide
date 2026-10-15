'use strict';

const path = require('path');
const express = require('express');
const db = require('./src/db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '25mb' }));

app.get('/api/health', function (req, res) {
  res.json({ ok: true });
});

app.get('/api/points', function (req, res) {
  res.json({ points: db.listPoints() });
});

app.post('/api/points', function (req, res) {
  const fields = normalizePoint(req.body, res);
  if (!fields) return;
  const point = db.createPoint(fields);
  res.status(201).json({ point: point });
});

app.put('/api/points/:id', function (req, res) {
  const existing = db.getPoint(req.params.id);
  if (!existing) return res.status(404).json({ error: 'point_not_found' });
  const fields = normalizePoint(req.body, res);
  if (!fields) return;
  existing.images.forEach(function (url) {
    if (fields.images.indexOf(url) === -1) db.removeImageFile(url);
  });
  res.json({ point: db.updatePoint(req.params.id, fields) });
});

app.delete('/api/points/:id', function (req, res) {
  const existing = db.getPoint(req.params.id);
  if (!existing) return res.status(404).json({ error: 'point_not_found' });
  existing.images.forEach(db.removeImageFile);
  db.deletePoint(req.params.id);
  res.json({ ok: true });
});

app.use('/uploads', express.static(db.UPLOAD_DIR, { maxAge: '30d' }));
app.use(express.static(PUBLIC_DIR));

function normalizePoint(body, res) {
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid_body' });
    return null;
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name_required' });
    return null;
  }
  const x = Number(body.x);
  const y = Number(body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    res.status(400).json({ error: 'invalid_coordinates' });
    return null;
  }

  const tips = Array.isArray(body.tips)
    ? body.tips.filter(function (t) { return typeof t === 'string' && t.trim(); })
        .map(function (t) { return t.trim(); }).slice(0, 6)
    : [];

  const incoming = Array.isArray(body.images) ? body.images : [];
  const images = [];
  for (let i = 0; i < incoming.length; i++) {
    const img = incoming[i];
    if (typeof img !== 'string') continue;
    if (img.indexOf('data:image/') === 0) {
      const saved = db.saveImageDataUrl(img);
      if (saved) images.push(saved);
    } else if (img.indexOf('/uploads/') === 0) {
      images.push(img);
    }
  }

  return {
    name: name.slice(0, 24),
    region: typeof body.region === 'string' ? body.region.trim().slice(0, 16) : '',
    type: typeof body.type === 'string' && body.type ? body.type : 'building',
    risk: typeof body.risk === 'string' && body.risk ? body.risk : '中',
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    desc: typeof body.desc === 'string' ? body.desc.trim().slice(0, 300) : '',
    tips: tips,
    images: images
  };
}

app.listen(PORT, '0.0.0.0', function () {
  console.log('erangel guafen map server listening on http://0.0.0.0:' + PORT);
});
