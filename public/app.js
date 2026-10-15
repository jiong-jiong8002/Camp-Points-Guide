(function () {
  'use strict';

  var typeMeta = window.TYPE_META || {};
  var riskMeta = window.RISK_META || {};
  var places = window.MAP_PLACES || [];

  var state = {
    type: 'all',
    query: '',
    view: 'map',
    activeId: null,
    picking: false,
    editingId: null,
    points: []
  };

  var pickCoord = null;
  var draftImages = [];

  var markerLayer = document.getElementById('markerLayer');
  var legendItems = document.getElementById('legendItems');
  var filterBar = document.querySelector('.filters');
  var cardGrid = document.getElementById('cardGrid');
  var emptyHint = document.getElementById('emptyHint');
  var mapView = document.getElementById('mapView');
  var listView = document.getElementById('listView');
  var mapFrame = document.querySelector('.map-frame');
  var mapCanvas = document.getElementById('mapCanvas');
  var zoomInBtn = document.getElementById('zoomIn');
  var zoomOutBtn = document.getElementById('zoomOut');
  var zoomResetBtn = document.getElementById('zoomReset');
  var searchInput = document.getElementById('search');
  var detail = document.getElementById('detail');
  var detailBody = document.getElementById('detailBody');
  var detailClose = document.getElementById('detailClose');
  var backdrop = document.getElementById('backdrop');

  var addBtn = document.getElementById('addBtn');
  var placeHint = document.getElementById('placeHint');
  var modal = document.getElementById('modal');
  var modalClose = document.getElementById('modalClose');
  var modalTitle = document.getElementById('modalTitle');
  var form = document.getElementById('pointForm');
  var fName = document.getElementById('fName');
  var fRegion = document.getElementById('fRegion');
  var fType = document.getElementById('fType');
  var fRisk = document.getElementById('fRisk');
  var fCoord = document.getElementById('fCoord');
  var fDesc = document.getElementById('fDesc');
  var fTips = document.getElementById('fTips');
  var fImages = document.getElementById('fImages');
  var imgPreview = document.getElementById('imgPreview');
  var pickBtn = document.getElementById('pickBtn');
  var cancelBtn = document.getElementById('cancelBtn');
  var regionList = document.getElementById('regionList');
  var formError = document.getElementById('formError');

  /* ---------------- api ---------------- */

  function apiFetch(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
          throw new Error(msg);
        }
        return data || {};
      });
    });
  }

  function loadPoints() {
    return apiFetch('/api/points').then(function (data) {
      state.points = Array.isArray(data.points) ? data.points : [];
    });
  }

  function findPoint(id) {
    for (var i = 0; i < state.points.length; i++) {
      if (state.points[i].id === id) return state.points[i];
    }
    return null;
  }

  /* ---------------- helpers ---------------- */

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pct(n) { return n + '%'; }

  function typeMetaOf(type) {
    return typeMeta[type] || { label: type, color: '#999' };
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 3200);
  }

  /* ---------------- render ---------------- */

  function renderLegend() {
    var html = '';
    Object.keys(typeMeta).forEach(function (key) {
      html += '<span><i style="background:' + typeMeta[key].color + '"></i>' + typeMeta[key].label + '</span>';
    });
    legendItems.innerHTML = html;
  }

  function renderFilters() {
    var counts = { all: state.points.length };
    Object.keys(typeMeta).forEach(function (k) { counts[k] = 0; });
    state.points.forEach(function (p) {
      counts[p.type] = (counts[p.type] || 0) + 1;
    });

    function chip(type, labelHtml, isActive) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (isActive ? ' is-active' : '');
      btn.dataset.type = type;
      btn.innerHTML = labelHtml;
      filterBar.appendChild(btn);
    }

    filterBar.innerHTML = '';
    chip('all', '全部 <em>' + counts.all + '</em>', state.type === 'all');

    Object.keys(typeMeta).forEach(function (key) {
      var meta = typeMeta[key];
      chip(key,
        '<span class="dot" style="color:' + meta.color + '"></span>' + meta.label + ' <em>' + counts[key] + '</em>',
        state.type === key);
    });
  }

  function matches(p) {
    if (state.type !== 'all' && p.type !== state.type) return false;

    if (state.query) {
      var q = state.query.toLowerCase();
      var hay = (p.name + ' ' + p.region + ' ' + (p.desc || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function renderMarkers() {
    markerLayer.innerHTML = '';
    state.points.forEach(function (p) {
      var meta = typeMetaOf(p.type);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'marker is-user';
      if (!matches(p)) btn.style.display = 'none';
      if (state.activeId === p.id) btn.classList.add('is-active');
      btn.style.left = pct(p.x);
      btn.style.top = pct(p.y);
      btn.style.color = meta.color;
      btn.setAttribute('aria-label', p.name + ' · ' + p.region);
      btn.dataset.id = p.id;

      var pin = document.createElement('span');
      pin.className = 'pin';
      pin.style.background = meta.color;
      btn.appendChild(pin);

      var label = document.createElement('span');
      label.className = 'label';
      label.textContent = p.name;
      btn.appendChild(label);

      markerLayer.appendChild(btn);
    });
    renderPickMarker();
  }

  function renderPickMarker() {
    var old = markerLayer.querySelector('.pick-marker');
    if (old) old.remove();
    if (!pickCoord) return;
    var m = document.createElement('div');
    m.className = 'pick-marker';
    m.style.left = pct(pickCoord.x);
    m.style.top = pct(pickCoord.y);
    markerLayer.appendChild(m);
  }

  function renderCards() {
    var list = state.points.filter(matches);
    cardGrid.innerHTML = '';
    emptyHint.hidden = list.length !== 0;

    list.forEach(function (p) {
      var t = typeMetaOf(p.type);
      var r = riskMeta[p.risk] || { label: p.risk, color: '#999' };
      var card = document.createElement('article');
      card.className = 'card';
      card.dataset.id = p.id;

      var cover = (p.images && p.images.length)
        ? '<div class="card-cover"><img src="' + p.images[0] + '" alt="' + esc(p.name) + '" loading="lazy" /></div>'
        : '';

      card.innerHTML =
        cover +
        '<div class="card-head">' +
          '<h3>' + esc(p.name) + '</h3>' +
          '<span class="region">' + esc(p.region) + '</span>' +
        '</div>' +
        '<p>' + esc(p.desc) + '</p>' +
        '<div class="card-meta">' +
          '<span class="tag type-tag" style="color:' + t.color + '">' + t.label + '</span>' +
          '<span class="tag" style="color:' + r.color + '">' + r.label + '</span>' +
        '</div>' +
        '<button type="button" class="card-act" data-card-action="delete" aria-label="删除">✕</button>';
      card.style.setProperty('--card-accent', t.color);
      cardGrid.appendChild(card);
    });
  }

  function openDetail(id) {
    var p = findPoint(id);
    if (!p) return;
    state.activeId = id;

    var t = typeMetaOf(p.type);
    var r = riskMeta[p.risk] || { label: p.risk, color: '#999' };
    var tipsHtml = (p.tips || []).map(function (tip) { return '<li>' + esc(tip) + '</li>'; }).join('');

    var galleryHtml = '';
    if (p.images && p.images.length) {
      galleryHtml = '<div class="gallery">' +
        p.images.map(function (src) {
          return '<img src="' + src + '" alt="' + esc(p.name) + '" loading="lazy" data-full="' + src + '" />';
        }).join('') + '</div>';
    }

    var actionsHtml =
      '<div class="detail-actions">' +
        '<button type="button" data-action="edit">编辑</button>' +
        '<button type="button" data-action="delete" class="danger">删除</button>' +
      '</div>';

    detailBody.innerHTML =
      '<span class="kicker">' + esc(p.region) + '</span>' +
      '<h2>' + esc(p.name) + '</h2>' +
      '<div class="sub">经典海岛 · 苟分点位</div>' +
      '<div class="tags">' +
        '<span class="tag type-tag" style="color:' + t.color + '">' + t.label + '</span>' +
        '<span class="tag" style="color:' + r.color + '">' + r.label + '</span>' +
      '</div>' +
      galleryHtml +
      (p.desc ? '<p class="desc">' + esc(p.desc) + '</p>' : '') +
      (tipsHtml ? '<h4>实战要点</h4><ol>' + tipsHtml + '</ol>' : '') +
      actionsHtml;

    detail.classList.add('is-open');
    detail.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    requestAnimationFrame(function () { backdrop.classList.add('is-open'); });
    renderMarkers();
  }

  function closeDetail() {
    state.activeId = null;
    detail.classList.remove('is-open');
    detail.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('is-open');
    setTimeout(function () { if (!modalOpen()) backdrop.hidden = true; }, 200);
    renderMarkers();
  }

  function switchView(view) {
    state.view = view;
    mapView.hidden = view !== 'map';
    listView.hidden = view !== 'list';
    document.querySelectorAll('.view-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === view);
    });
  }

  function buildRegionList() {
    regionList.innerHTML = '';
    var seen = {};
    places.concat(state.points.map(function (p) { return p.region; })).forEach(function (name) {
      if (!name || seen[name]) return;
      seen[name] = 1;
      var opt = document.createElement('option');
      opt.value = name;
      regionList.appendChild(opt);
    });
  }

  function refresh() {
    renderMarkers();
    renderCards();
    renderFilters();
    buildRegionList();
  }

  /* ---------------- image handling ---------------- */

  function compressImage(file, maxSize, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function (e) {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解析失败')); };
        img.onload = function () {
          var w = img.width;
          var h = img.height;
          var scale = Math.min(1, maxSize / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderImgPreview() {
    imgPreview.innerHTML = '';
    draftImages.forEach(function (src, i) {
      var box = document.createElement('div');
      box.className = 'img-thumb';
      box.innerHTML = '<img src="' + src + '" alt="预览" /><button type="button" aria-label="移除">×</button>';
      box.querySelector('button').addEventListener('click', function () {
        draftImages.splice(i, 1);
        renderImgPreview();
      });
      imgPreview.appendChild(box);
    });
  }

  fImages.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fImages.files || []);
    if (!files.length) return;
    var tasks = files.map(function (f) {
      return compressImage(f, 1280, 0.72).catch(function () { return null; });
    });
    Promise.all(tasks).then(function (results) {
      results.forEach(function (src) { if (src) draftImages.push(src); });
      renderImgPreview();
      fImages.value = '';
    });
  });

  /* ---------------- modal ---------------- */

  function modalOpen() { return !modal.hidden; }

  function buildTypeOptions() {
    Object.keys(typeMeta).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = typeMeta[key].label;
      fType.appendChild(opt);
    });
  }

  function setCoordUI() {
    if (pickCoord) {
      fCoord.textContent = pickCoord.x.toFixed(1) + '% , ' + pickCoord.y.toFixed(1) + '%';
      fCoord.classList.remove('is-empty');
    } else {
      fCoord.textContent = '未选择';
      fCoord.classList.add('is-empty');
    }
  }

  function resetForm() {
    form.reset();
    draftImages = [];
    renderImgPreview();
    formError.hidden = true;
    formError.textContent = '';
    fType.selectedIndex = 0;
    fRisk.value = '中';
  }

  function showModal() {
    modal.hidden = false;
    backdrop.hidden = false;
    backdrop.classList.add('is-open');
    renderPickMarker();
  }

  function openModal(editPoint) {
    state.editingId = editPoint ? editPoint.id : null;
    modalTitle.textContent = editPoint ? '编辑苟分点' : '新建苟分点';

    resetForm();

    if (editPoint) {
      fName.value = editPoint.name || '';
      fRegion.value = editPoint.region || '';
      fType.value = editPoint.type || Object.keys(typeMeta)[0];
      fRisk.value = editPoint.risk || '中';
      fDesc.value = editPoint.desc || '';
      fTips.value = (editPoint.tips || []).join('\n');
      draftImages = (editPoint.images || []).slice();
      renderImgPreview();
      pickCoord = { x: editPoint.x, y: editPoint.y };
    }

    setCoordUI();
    showModal();
    setTimeout(function () { fName.focus(); }, 50);
  }

  function closeModal() {
    modal.hidden = true;
    state.editingId = null;
    pickCoord = null;
    renderPickMarker();
    if (!detail.classList.contains('is-open')) {
      backdrop.classList.remove('is-open');
      setTimeout(function () { backdrop.hidden = true; }, 200);
    }
  }

  function startPicking() {
    state.picking = true;
    modal.hidden = true;
    backdrop.classList.remove('is-open');
    backdrop.hidden = true;
    placeHint.hidden = false;
    switchView('map');
    mapFrame.classList.add('is-picking');
    mapFrame.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function stopPicking() {
    state.picking = false;
    placeHint.hidden = true;
    mapFrame.classList.remove('is-picking');
  }

  function handleMapPick(e) {
    if (!state.picking) return;
    var rect = mapCanvas.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 100;
    var y = ((e.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    pickCoord = { x: x, y: y };
    stopPicking();
    setCoordUI();
    showModal();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formError.hidden = true;

    var name = fName.value.trim();
    if (!name) {
      formError.textContent = '请填写点位名称';
      formError.hidden = false;
      return;
    }
    if (!pickCoord) {
      formError.textContent = '请先点击"重新选点"在地图上选择位置';
      formError.hidden = false;
      return;
    }

    var tips = fTips.value.split('\n')
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length; })
      .slice(0, 6);

    var payload = {
      name: name,
      region: fRegion.value.trim() || '自定义',
      type: fType.value || Object.keys(typeMeta)[0],
      risk: fRisk.value,
      x: Math.round(pickCoord.x * 10) / 10,
      y: Math.round(pickCoord.y * 10) / 10,
      desc: fDesc.value.trim(),
      tips: tips,
      images: draftImages.slice()
    };

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    var editingId = state.editingId;
    var request = editingId
      ? apiFetch('/api/points/' + editingId, { method: 'PUT', body: payload })
      : apiFetch('/api/points', { method: 'POST', body: payload });

    request
      .then(function (data) {
        return loadPoints().then(function () {
          closeModal();
          refresh();
          if (data.point) openDetail(data.point.id);
        });
      })
      .catch(function (err) {
        formError.textContent = '保存失败：' + err.message;
        formError.hidden = false;
      })
      .then(function () {
        submitBtn.disabled = false;
      });
  });

  /* ---------------- zoom & pan ---------------- */

  var MIN_SCALE = 1;
  var MAX_SCALE = 8;
  var view = { scale: 1, tx: 0, ty: 0 };

  function applyView() {
    mapCanvas.style.transform =
      'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.scale + ')';
    markerLayer.style.setProperty('--inv', 1 / view.scale);
    mapFrame.classList.toggle('is-zoomed', view.scale > MIN_SCALE + 1e-6);
    zoomInBtn.disabled = view.scale >= MAX_SCALE - 1e-6;
    zoomOutBtn.disabled = view.scale <= MIN_SCALE + 1e-6;
  }

  function clampView() {
    var w = mapFrame.clientWidth;
    var h = mapFrame.clientHeight;
    var minTx = w - w * view.scale;
    var minTy = h - h * view.scale;
    view.tx = Math.max(minTx, Math.min(0, view.tx));
    view.ty = Math.max(minTy, Math.min(0, view.ty));
  }

  function zoomAt(clientX, clientY, factor) {
    var rect = mapFrame.getBoundingClientRect();
    var px = clientX - rect.left;
    var py = clientY - rect.top;
    var next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
    if (next === view.scale) return;
    var ratio = next / view.scale;
    view.tx = px - (px - view.tx) * ratio;
    view.ty = py - (py - view.ty) * ratio;
    view.scale = next;
    clampView();
    applyView();
  }

  function zoomCenter(factor) {
    var rect = mapFrame.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function resetZoom() {
    view.scale = 1;
    view.tx = 0;
    view.ty = 0;
    applyView();
  }

  mapFrame.addEventListener('wheel', function (e) {
    if (mapView.hidden) return;
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }, { passive: false });

  var drag = { active: false, moved: false, startX: 0, startY: 0, baseTx: 0, baseTy: 0 };

  mapFrame.addEventListener('mousedown', function (e) {
    if (state.picking || e.button !== 0) return;
    if (e.target.closest('.zoom-controls')) return;
    if (view.scale <= MIN_SCALE) return;
    drag.active = true;
    drag.moved = false;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.baseTx = view.tx;
    drag.baseTy = view.ty;
    mapCanvas.classList.add('is-dragging');
  });

  window.addEventListener('mousemove', function (e) {
    if (!drag.active) return;
    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    view.tx = drag.baseTx + dx;
    view.ty = drag.baseTy + dy;
    clampView();
    applyView();
  });

  window.addEventListener('mouseup', function () {
    if (!drag.active) return;
    drag.active = false;
    mapCanvas.classList.remove('is-dragging');
  });

  mapFrame.addEventListener('click', function (e) {
    if (state.picking) { handleMapPick(e); return; }
    if (drag.moved) { drag.moved = false; return; }
  });

  markerLayer.addEventListener('click', function (e) {
    if (drag.moved) { drag.moved = false; e.stopPropagation(); return; }
  }, true);

  zoomInBtn.addEventListener('click', function () { zoomCenter(1.4); });
  zoomOutBtn.addEventListener('click', function () { zoomCenter(1 / 1.4); });
  zoomResetBtn.addEventListener('click', resetZoom);

  /* ---------------- events ---------------- */

  markerLayer.addEventListener('click', function (e) {
    if (state.picking) return;
    var btn = e.target.closest('.marker');
    if (btn) openDetail(btn.dataset.id);
  });

  cardGrid.addEventListener('click', function (e) {
    var actBtn = e.target.closest('[data-card-action]');
    if (actBtn) {
      e.stopPropagation();
      var cid = actBtn.closest('.card').dataset.id;
      if (actBtn.dataset.cardAction === 'delete') removePoint(cid);
      return;
    }
    var card = e.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  });

  filterBar.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    state.type = chip.dataset.type;
    refresh();
  });

  document.querySelectorAll('.view-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { switchView(btn.dataset.view); });
  });

  var searchTimer = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = searchInput.value.trim();
      renderMarkers();
      renderCards();
    }, 120);
  });

  detailBody.addEventListener('click', function (e) {
    var img = e.target.closest('.gallery img');
    if (img) {
      var lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.innerHTML = '<img src="' + img.dataset.full + '" alt="" />';
      lb.addEventListener('click', function () { lb.remove(); });
      document.body.appendChild(lb);
      return;
    }

    var actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    var id = state.activeId;

    if (actionBtn.dataset.action === 'edit') {
      var p = findPoint(id);
      if (p) openModal(p);
    } else if (actionBtn.dataset.action === 'delete') {
      removePoint(id);
    }
  });

  function removePoint(id) {
    var target = findPoint(id);
    if (!target) return;
    if (!window.confirm('确定删除「' + target.name + '」这个苟分点吗？')) return;
    apiFetch('/api/points/' + id, { method: 'DELETE' })
      .then(function () {
        closeDetail();
        return loadPoints();
      })
      .then(refresh)
      .catch(function (err) { toast('删除失败：' + err.message); });
  }

  addBtn.addEventListener('click', function () {
    pickCoord = null;
    openModal(null);
  });

  pickBtn.addEventListener('click', function () { startPicking(); });
  modalClose.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  detailClose.addEventListener('click', closeDetail);

  backdrop.addEventListener('click', function () {
    if (modalOpen()) { closeModal(); return; }
    closeDetail();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.picking) { stopPicking(); showModal(); return; }
    if (modalOpen()) { closeModal(); return; }
    closeDetail();
  });

  /* ---------------- init ---------------- */

  buildTypeOptions();
  renderLegend();
  setCoordUI();
  applyView();
  refresh();

  loadPoints()
    .then(refresh)
    .catch(function (err) {
      toast('加载点位失败：' + err.message);
    });
})();
