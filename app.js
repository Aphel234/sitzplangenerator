'use strict';

const STORAGE_KEY = 'sitzplatzgenerator-v1';
let suppressLocalSave = false;

const state = {
  rows: 5,
  cols: 6,
  seatLayout: 'single',
  activeSeats: new Set(),
  students: [],
  rules: [],
  assignment: new Map(), // seatKey -> studentId
  lastEvaluation: null,
  metadata: { className: '', roomName: '', subject: '' },
};

const els = {
  classNameInput: document.querySelector('#classNameInput'),
  roomNameInput: document.querySelector('#roomNameInput'),
  subjectInput: document.querySelector('#subjectInput'),
  boardMeta: document.querySelector('#boardMeta'),
  rowsInput: document.querySelector('#rowsInput'),
  colsInput: document.querySelector('#colsInput'),
  seatLayoutInput: document.querySelector('#seatLayoutInput'),
  buildRoomBtn: document.querySelector('#buildRoomBtn'),
  roomGrid: document.querySelector('#roomGrid'),
  seatTemplate: document.querySelector('#seatTemplate'),
  studentsInput: document.querySelector('#studentsInput'),
  applyStudentsBtn: document.querySelector('#applyStudentsBtn'),
  studentCount: document.querySelector('#studentCount'),
  mixCategories: document.querySelector('#mixCategories'),
  groupCategories: document.querySelector('#groupCategories'),
  everyoneHasNeighbor: document.querySelector('#everyoneHasNeighbor'),
  fillFrontFirst: document.querySelector('#fillFrontFirst'),
  avoidEmptyGaps: document.querySelector('#avoidEmptyGaps'),
  ruleStudentA: document.querySelector('#ruleStudentA'),
  ruleStudentB: document.querySelector('#ruleStudentB'),
  ruleType: document.querySelector('#ruleType'),
  ruleDistance: document.querySelector('#ruleDistance'),
  rulePriority: document.querySelector('#rulePriority'),
  studentBLabel: document.querySelector('#studentBLabel'),
  distanceLabel: document.querySelector('#distanceLabel'),
  seatLabel: document.querySelector('#seatLabel'),
  ruleSeat: document.querySelector('#ruleSeat'),
  priorityLabel: document.querySelector('#priorityLabel'),
  addRuleBtn: document.querySelector('#addRuleBtn'),
  rulesList: document.querySelector('#rulesList'),
  generateBtn: document.querySelector('#generateBtn'),
  resultSummary: document.querySelector('#resultSummary'),
  conflictsList: document.querySelector('#conflictsList'),
  scoreBadge: document.querySelector('#scoreBadge'),
  saveBtn: document.querySelector('#saveBtn'),
  loadInput: document.querySelector('#loadInput'),
  clearLocalBtn: document.querySelector('#clearLocalBtn'),
  printBtn: document.querySelector('#printBtn'),
  teacherPrintBtn: document.querySelector('#teacherPrintBtn'),
  classbookPrintBtn: document.querySelector('#classbookPrintBtn'),
  teacherPrintView: document.querySelector('#teacherPrintView'),
  teacherRoomGrid: document.querySelector('#teacherRoomGrid'),
  teacherPrintDate: document.querySelector('#teacherPrintDate'),
  teacherPrintMeta: document.querySelector('#teacherPrintMeta'),
  classbookPrintView: document.querySelector('#classbookPrintView'),
  classbookRoomGrid: document.querySelector('#classbookRoomGrid'),
  classbookTitle: document.querySelector('#classbookTitle'),
  classbookRoom: document.querySelector('#classbookRoom'),
  classbookSubject: document.querySelector('#classbookSubject'),
  classbookDate: document.querySelector('#classbookDate'),
};

function seatKey(row, col) { return `${row}:${col}`; }
function parseSeatKey(key) {
  const [row, col] = key.split(':').map(Number);
  return { row, col };
}
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function studentById(id) { return state.students.find(s => s.id === id); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function seatDisplayName(key) {
  const { row, col } = parseSeatKey(key);
  return `Reihe ${row + 1}, Platz ${col + 1}`;
}

function fixedSeatRules() { return state.rules.filter(rule => rule.type === 'fixedSeat'); }
function fixedSeatForStudent(studentId) { return fixedSeatRules().find(rule => rule.a === studentId)?.seat || null; }
function fixedStudentForSeat(key) { return fixedSeatRules().find(rule => rule.seat === key)?.a || null; }
function isFixedSeat(key) { return Boolean(fixedStudentForSeat(key)); }
function isFixedStudent(studentId) { return Boolean(fixedSeatForStudent(studentId)); }

function updateSeatOptions() {
  if (!els.ruleSeat) return;
  const previous = els.ruleSeat.value;
  const seats = activeSeatKeys().sort((a, b) => {
    const pa = parseSeatKey(a), pb = parseSeatKey(b);
    return pa.row - pb.row || pa.col - pb.col;
  });
  els.ruleSeat.innerHTML = seats.length
    ? seats.map(key => `<option value="${escapeHtml(key)}">${escapeHtml(seatDisplayName(key))}</option>`).join('')
    : '<option value="">Keine aktiven Plätze</option>';
  if (previous && state.activeSeats.has(previous)) els.ruleSeat.value = previous;
}

function validateFixedSeatRules() {
  const errors = [];
  const assignment = new Map();
  const seenStudents = new Map();
  const seenSeats = new Map();

  for (const rule of fixedSeatRules()) {
    const student = studentById(rule.a);
    if (!student) {
      errors.push('Eine feste Platzzuweisung verweist auf einen unbekannten Schüler.');
      continue;
    }
    if (!rule.seat || !state.activeSeats.has(rule.seat)) {
      errors.push(`${student.name}: Der fest zugewiesene Platz ist nicht aktiv.`);
      continue;
    }
    if (seenStudents.has(rule.a) && seenStudents.get(rule.a) !== rule.seat) {
      errors.push(`${student.name} wurde mehreren festen Plätzen zugewiesen.`);
      continue;
    }
    if (seenSeats.has(rule.seat) && seenSeats.get(rule.seat) !== rule.a) {
      const other = studentById(seenSeats.get(rule.seat))?.name || 'Ein anderer Schüler';
      errors.push(`${seatDisplayName(rule.seat)} ist sowohl ${other} als auch ${student.name} zugewiesen.`);
      continue;
    }
    seenStudents.set(rule.a, rule.seat);
    seenSeats.set(rule.seat, rule.a);
    assignment.set(rule.seat, rule.a);
  }

  return { errors, assignment };
}

function readMetadataFromInputs() {
  state.metadata = {
    className: els.classNameInput.value.trim(),
    roomName: els.roomNameInput.value.trim(),
    subject: els.subjectInput.value.trim(),
  };
  renderMetadata();
}

function metadataParts() {
  const parts = [];
  if (state.metadata.className) parts.push(`Klasse ${state.metadata.className}`);
  if (state.metadata.roomName) parts.push(`Raum ${state.metadata.roomName}`);
  if (state.metadata.subject) parts.push(state.metadata.subject);
  return parts;
}

function renderMetadata() {
  const text = metadataParts().join(' · ');
  els.boardMeta.textContent = text;
  els.boardMeta.classList.toggle('empty', !text);
}

function formattedDate() {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date());
}

function initRoom(rows = state.rows, cols = state.cols, keepBlocked = false) {
  state.seatLayout = els.seatLayoutInput?.value === 'double' ? 'double' : 'single';
  const oldActive = new Set(state.activeSeats);
  state.rows = clamp(Number(rows) || 5, 1, 12);
  state.cols = clamp(Number(cols) || 6, 1, 12);
  state.activeSeats.clear();
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const key = seatKey(r, c);
      if (!keepBlocked || oldActive.has(key)) state.activeSeats.add(key);
    }
  }
  state.assignment.clear();
  state.rules = state.rules.filter(rule => rule.type !== 'fixedSeat' || state.activeSeats.has(rule.seat));
  renderRules();
  updateSeatOptions();
  renderRoom();
}

function renderRoom() {
  els.roomGrid.style.gridTemplateColumns = `repeat(${state.cols}, minmax(74px, 1fr))`;
  els.roomGrid.classList.toggle('double-layout', state.seatLayout === 'double');
  els.roomGrid.innerHTML = '';

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const key = seatKey(r, c);
      const node = els.seatTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.key = key;
      node.dataset.col = String(c);
      applyDeskClasses(node, c, false);
      node.querySelector('.seat-number').textContent = `R${r + 1} · P${c + 1}`;
      const active = state.activeSeats.has(key);
      node.classList.toggle('blocked', !active);
      node.setAttribute('aria-pressed', String(!active));

      const fixedStudentId = fixedStudentForSeat(key);
      const studentId = state.assignment.get(key);
      const student = studentById(studentId);
      if (fixedStudentId && active) {
        node.classList.add('fixed-seat');
        node.title = `Fest zugewiesen: ${studentById(fixedStudentId)?.name || 'Schüler'}`;
        node.querySelector('.seat-number').textContent = `📌 R${r + 1} · P${c + 1}`;
      }
      if (student && active) {
        node.classList.add('assigned');
        node.querySelector('.seat-name').textContent = student.name;
        node.querySelector('.seat-category').textContent = student.category || '';
        node.draggable = !isFixedStudent(student.id);
        node.classList.toggle('fixed-occupant', isFixedStudent(student.id));
      } else {
        node.querySelector('.seat-name').textContent = active ? 'Freier Platz' : 'Gesperrt';
        node.querySelector('.seat-category').textContent = '';
      }

      node.addEventListener('click', () => toggleSeat(key));
      node.addEventListener('dragstart', onDragStart);
      node.addEventListener('dragover', onDragOver);
      node.addEventListener('dragleave', onDragLeave);
      node.addEventListener('drop', onDrop);
      els.roomGrid.appendChild(node);
    }
  }
}

function toggleSeat(key) {
  const fixedRule = fixedSeatRules().find(rule => rule.seat === key);
  let fixedRemovalConfirmed = false;
  if (state.activeSeats.has(key) && fixedRule) {
    const name = studentById(fixedRule.a)?.name || 'Ein Schüler';
    if (!confirm(`${seatDisplayName(key)} ist ${name} fest zugewiesen. Zuweisung entfernen und Platz sperren?`)) return;
    fixedRemovalConfirmed = true;
  }
  if (state.assignment.size > 0) {
    const occupied = state.assignment.has(key);
    if (occupied && !fixedRemovalConfirmed && !confirm('Dieser Platz ist belegt. Platz trotzdem sperren und Schüler neu verteilen?')) return;
    state.assignment.clear();
    clearResults();
  }
  if (fixedRemovalConfirmed) {
    state.rules = state.rules.filter(rule => rule.id !== fixedRule.id);
    renderRules();
  }
  if (state.activeSeats.has(key)) state.activeSeats.delete(key);
  else state.activeSeats.add(key);
  updateSeatOptions();
  renderRoom();
  saveLocal();
}

let draggedSeatKey = null;
function onDragStart(event) {
  draggedSeatKey = event.currentTarget.dataset.key;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedSeatKey);
}
function onDragOver(event) {
  if (!state.activeSeats.has(event.currentTarget.dataset.key)) return;
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}
function onDragLeave(event) { event.currentTarget.classList.remove('drag-over'); }
function onDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const from = draggedSeatKey || event.dataTransfer.getData('text/plain');
  const to = event.currentTarget.dataset.key;
  if (!from || !to || from === to || !state.activeSeats.has(to)) return;
  const fromStudent = state.assignment.get(from);
  const toStudent = state.assignment.get(to);
  if (!fromStudent) return;
  const fromFixedSeat = fixedSeatForStudent(fromStudent);
  const toFixedStudent = fixedStudentForSeat(to);
  const displacedFixedSeat = toStudent ? fixedSeatForStudent(toStudent) : null;
  if (fromFixedSeat && fromFixedSeat !== to) {
    alert(`${studentById(fromStudent)?.name || 'Dieser Schüler'} hat einen festen Sitzplatz und kann nicht verschoben werden.`);
    return;
  }
  if (toFixedStudent && toFixedStudent !== fromStudent) {
    alert(`Dieser Platz ist ${studentById(toFixedStudent)?.name || 'einem anderen Schüler'} fest zugewiesen.`);
    return;
  }
  if (toStudent && displacedFixedSeat === to) {
    alert(`${studentById(toStudent)?.name || 'Der Schüler auf diesem Platz'} hat einen festen Sitzplatz und kann nicht getauscht werden.`);
    return;
  }
  state.assignment.set(to, fromStudent);
  if (toStudent) state.assignment.set(from, toStudent);
  else state.assignment.delete(from);
  renderRoom();
  showEvaluation(evaluateAssignment(state.assignment));
  saveLocal();
}

function applyStudents() {
  const lines = els.studentsInput.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const previous = new Map(state.students.map(s => [`${s.name}|${s.category}`, s.id]));
  const seenNames = new Map();
  state.students = lines.map((line, index) => {
    const [rawName, rawCategory = ''] = line.split(';');
    let name = rawName.trim() || `Schüler ${index + 1}`;
    const duplicateCount = (seenNames.get(name) || 0) + 1;
    seenNames.set(name, duplicateCount);
    if (duplicateCount > 1) name = `${name} (${duplicateCount})`;
    const category = rawCategory.trim();
    return { id: previous.get(`${name}|${category}`) || uid(), name, category };
  });
  state.rules = state.rules.filter(rule => {
    const ids = new Set(state.students.map(s => s.id));
    return ids.has(rule.a) && (!rule.b || ids.has(rule.b));
  });
  state.assignment.clear();
  clearResults();
  renderMetadata();
  updateStudentUI();
  renderRules();
  renderRoom();
}

function updateStudentUI() {
  els.studentCount.textContent = `${state.students.length} ${state.students.length === 1 ? 'Schüler' : 'Schüler'}`;
  const options = state.students.length
    ? state.students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('')
    : '<option value="">Keine Schüler</option>';
  els.ruleStudentA.innerHTML = options;
  els.ruleStudentB.innerHTML = options;
  updateSeatOptions();
}

function applyDeskClasses(node, col, reversed = false) {
  if (state.seatLayout !== 'double') return;
  node.classList.add('double-seat');
  const partnerCol = col % 2 === 0 ? col + 1 : col - 1;
  const hasPartner = partnerCol >= 0 && partnerCol < state.cols;
  if (!hasPartner) {
    node.classList.add('single-remainder');
    return;
  }
  const visualLeft = reversed ? col % 2 === 1 : col % 2 === 0;
  node.classList.add(visualLeft ? 'desk-left' : 'desk-right');
  const boundaryAfter = reversed ? col % 2 === 0 : col % 2 === 1;
  if (boundaryAfter && (reversed ? col > 0 : col < state.cols - 1)) node.classList.add('desk-boundary');
}

function updateRuleFormVisibility() {
  const type = els.ruleType.value;
  const needsB = ['together', 'notAdjacent', 'notNear', 'far'].includes(type);
  els.studentBLabel.classList.toggle('hidden', !needsB);
  els.distanceLabel.classList.toggle('hidden', type !== 'notNear');
  els.seatLabel.classList.toggle('hidden', type !== 'fixedSeat');
  els.rulePriority.disabled = type === 'fixedSeat';
  if (type === 'front' || type === 'back' || type === 'alone' || type === 'fixedSeat' || type === 'together' || type === 'notAdjacent') {
    els.rulePriority.value = 'hard';
  }
}

function addRule() {
  if (!state.students.length) return alert('Bitte zuerst eine Schülerliste übernehmen.');
  const type = els.ruleType.value;
  const a = els.ruleStudentA.value;
  const needsB = ['together', 'notAdjacent', 'notNear', 'far'].includes(type);
  const b = needsB ? els.ruleStudentB.value : null;
  const seat = type === 'fixedSeat' ? els.ruleSeat.value : null;
  if (needsB && a === b) return alert('Bitte zwei unterschiedliche Schüler auswählen.');
  if (type === 'fixedSeat') {
    if (!seat || !state.activeSeats.has(seat)) return alert('Bitte einen aktiven Sitzplatz auswählen.');
    const existingStudentRule = fixedSeatRules().find(rule => rule.a === a);
    if (existingStudentRule) return alert(`${studentById(a)?.name || 'Dieser Schüler'} hat bereits einen festen Sitzplatz. Bitte die bestehende Regel zuerst löschen.`);
    const existingSeatRule = fixedSeatRules().find(rule => rule.seat === seat);
    if (existingSeatRule) return alert(`${seatDisplayName(seat)} ist bereits ${studentById(existingSeatRule.a)?.name || 'einem Schüler'} zugewiesen.`);
  }
  const rule = {
    id: uid(),
    type,
    a,
    b,
    seat,
    distance: type === 'notNear' ? clamp(Number(els.ruleDistance.value) || 3, 2, 10) : null,
    priority: type === 'fixedSeat' ? 'hard' : els.rulePriority.value,
  };
  state.rules.push(rule);
  renderRules();
  renderRoom();
  saveLocal();
}

function ruleLabel(rule) {
  const a = studentById(rule.a)?.name || 'Unbekannt';
  const b = studentById(rule.b)?.name || 'Unbekannt';
  const labels = {
    together: `${a} muss direkt neben ${b} sitzen`,
    notAdjacent: `${a} darf nicht direkt neben ${b} sitzen`,
    notNear: `${a} soll mindestens ${rule.distance} Plätze Abstand zu ${b} haben`,
    far: `${a} soll möglichst weit weg von ${b} sitzen`,
    front: `${a} muss vorne sitzen`,
    back: `${a} muss hinten sitzen`,
    alone: `${a} muss alleine sitzen`,
    fixedSeat: `${a} muss auf ${rule.seat ? seatDisplayName(rule.seat) : 'einem festen Platz'} sitzen`,
  };
  return labels[rule.type] || 'Unbekannte Regel';
}

function renderRules() {
  if (!state.rules.length) {
    els.rulesList.className = 'rules-list empty-state';
    els.rulesList.textContent = 'Noch keine Regeln angelegt.';
    return;
  }
  els.rulesList.className = 'rules-list';
  els.rulesList.innerHTML = '';
  for (const rule of state.rules) {
    const item = document.createElement('div');
    item.className = 'rule-item';
    item.innerHTML = `<div><strong>${escapeHtml(ruleLabel(rule))}</strong><small>${rule.priority === 'hard' ? 'Muss-Regel' : 'Soll-Regel'}</small></div><button type="button" aria-label="Regel löschen">×</button>`;
    item.querySelector('button').addEventListener('click', () => {
      state.rules = state.rules.filter(r => r.id !== rule.id);
      renderRules();
      renderRoom();
      saveLocal();
    });
    els.rulesList.appendChild(item);
  }
}

function activeSeatKeys() { return [...state.activeSeats]; }
function coordsForStudent(assignment) {
  const map = new Map();
  for (const [key, studentId] of assignment.entries()) map.set(studentId, parseSeatKey(key));
  return map;
}
function manhattan(a, b) { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col); }
function isHorizontalNeighbor(a, b) {
  if (a.row !== b.row || Math.abs(a.col - b.col) !== 1) return false;
  if (state.seatLayout === 'double') return Math.floor(a.col / 2) === Math.floor(b.col / 2);
  return true;
}
function occupiedStudentAt(assignment, row, col) {
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return null;
  const key = seatKey(row, col);
  if (!state.activeSeats.has(key)) return null;
  return assignment.get(key) || null;
}
function sitsAlone(assignment, pos) {
  if (state.seatLayout === 'double') {
    const partnerCol = pos.col % 2 === 0 ? pos.col + 1 : pos.col - 1;
    return !occupiedStudentAt(assignment, pos.row, partnerCol);
  }
  return !occupiedStudentAt(assignment, pos.row, pos.col - 1)
    && !occupiedStudentAt(assignment, pos.row, pos.col + 1);
}
function isFront(pos) { return pos.row < Math.max(1, Math.ceil(state.rows / 3)); }
function isBack(pos) { return pos.row >= Math.floor((state.rows * 2) / 3); }

function evaluateAssignment(assignment) {
  const positions = coordsForStudent(assignment);
  let hardViolations = 0;
  let softPenalty = 0;
  let softPossible = 0;
  const conflicts = [];
  const fulfilled = [];

  for (const rule of state.rules) {
    const aPos = positions.get(rule.a);
    const bPos = rule.b ? positions.get(rule.b) : null;
    if (rule.type !== 'fixedSeat' && (!aPos || (rule.b && !bPos))) continue;
    let satisfied = true;
    let penalty = 0;

    if (rule.type === 'together') satisfied = isHorizontalNeighbor(aPos, bPos);
    if (rule.type === 'notAdjacent') satisfied = !isHorizontalNeighbor(aPos, bPos);
    if (rule.type === 'notNear') {
      const d = manhattan(aPos, bPos);
      satisfied = d >= rule.distance;
      penalty = Math.max(0, rule.distance - d) * 8;
    }
    if (rule.type === 'far') {
      const maxDistance = Math.max(1, (state.rows - 1) + (state.cols - 1));
      const d = manhattan(aPos, bPos);
      penalty = (maxDistance - d) * 2;
      satisfied = d >= Math.ceil(maxDistance * 0.65);
    }
    if (rule.type === 'front') satisfied = isFront(aPos);
    if (rule.type === 'back') satisfied = isBack(aPos);
    if (rule.type === 'alone') satisfied = sitsAlone(assignment, aPos);
    if (rule.type === 'fixedSeat') satisfied = Boolean(aPos && rule.seat && seatKey(aPos.row, aPos.col) === rule.seat);

    if (rule.priority === 'hard') {
      if (!satisfied) {
        hardViolations += 1;
        conflicts.push({ hard: true, text: ruleLabel(rule) });
      } else fulfilled.push(ruleLabel(rule));
    } else {
      softPossible += 20;
      if (!satisfied) {
        softPenalty += penalty || 20;
        conflicts.push({ hard: false, text: ruleLabel(rule) });
      } else fulfilled.push(ruleLabel(rule));
    }
  }

  // General principles
  const occupied = [...assignment.entries()].map(([key, studentId]) => ({ key, student: studentById(studentId), pos: parseSeatKey(key) }));
  if (els.mixCategories.checked || els.groupCategories.checked) {
    for (const item of occupied) {
      const right = occupied.find(other => isHorizontalNeighbor(item.pos, other.pos) && other.pos.col > item.pos.col);
      if (!right || !item.student?.category || !right.student?.category) continue;
      softPossible += 3;
      const sameCategory = item.student.category.localeCompare(right.student.category, 'de', { sensitivity: 'base' }) === 0;
      if (els.mixCategories.checked && sameCategory) softPenalty += 3;
      if (els.groupCategories.checked && !sameCategory) softPenalty += 3;
    }
  }
  if (els.everyoneHasNeighbor.checked) {
    const mustSitAlone = new Set(state.rules
      .filter(rule => rule.type === 'alone' && rule.priority === 'hard')
      .map(rule => rule.a));
    const withoutNeighbor = [];
    for (const item of occupied) {
      if (mustSitAlone.has(item.student?.id)) continue;
      softPossible += 4;
      const hasNeighbor = occupied.some(other =>
        other.student?.id !== item.student?.id && isHorizontalNeighbor(item.pos, other.pos)
      );
      if (!hasNeighbor) {
        softPenalty += 4;
        if (item.student?.name) withoutNeighbor.push(item.student.name);
      }
    }
    if (withoutNeighbor.length) {
      const names = withoutNeighbor.slice(0, 6).join(', ');
      const suffix = withoutNeighbor.length > 6 ? ` und ${withoutNeighbor.length - 6} weitere` : '';
      conflicts.push({
        hard: false,
        text: `${withoutNeighbor.length} ${withoutNeighbor.length === 1 ? 'Schüler hat' : 'Schüler haben'} keinen direkten Nachbarn: ${names}${suffix}`,
      });
    }
  }
  if (els.fillFrontFirst.checked) {
    const rows = occupied.map(item => item.pos.row);
    const deepest = rows.length ? Math.max(...rows) : 0;
    softPossible += Math.max(1, occupied.length);
    softPenalty += occupied.filter(item => item.pos.row > Math.ceil(deepest * .7)).length * .4;
  }
  if (els.avoidEmptyGaps.checked) {
    for (let r = 0; r < state.rows; r++) {
      const occupiedCols = occupied.filter(i => i.pos.row === r).map(i => i.pos.col).sort((a,b) => a-b);
      for (let i = 1; i < occupiedCols.length; i++) {
        const gap = occupiedCols[i] - occupiedCols[i - 1] - 1;
        if (gap > 0) {
          softPossible += gap;
          softPenalty += gap;
        }
      }
    }
  }

  const hardScore = hardViolations === 0 ? 100 : Math.max(0, 100 - hardViolations * 24);
  const softScore = softPossible === 0 ? 100 : Math.max(0, 100 - (softPenalty / softPossible) * 100);
  const score = Math.round(hardScore * .75 + softScore * .25);
  const objective = hardViolations * 10000 + softPenalty;
  return { hardViolations, softPenalty, score, objective, conflicts, fulfilled };
}

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createInitialAssignment(seats) {
  const fixed = validateFixedSeatRules().assignment;
  const fixedStudents = new Set(fixed.values());
  const availableSeats = seats.filter(key => !fixed.has(key));
  const seatOrder = els.fillFrontFirst.checked
    ? [...availableSeats].sort((a, b) => {
        const pa = parseSeatKey(a), pb = parseSeatKey(b);
        return pa.row - pb.row || pa.col - pb.col;
      })
    : shuffled(availableSeats);
  const studentOrder = shuffled(state.students.filter(student => !fixedStudents.has(student.id)));
  const assignment = new Map(fixed);
  studentOrder.forEach((student, index) => assignment.set(seatOrder[index], student.id));
  return assignment;
}

function mutateAssignment(assignment, seats) {
  const next = new Map(assignment);
  const occupiedSeats = [...next.keys()].filter(key => !isFixedSeat(key) && !isFixedStudent(next.get(key)));
  const emptySeats = seats.filter(key => !next.has(key) && !isFixedSeat(key));
  if (occupiedSeats.length < 1) return next;

  if (emptySeats.length && Math.random() < .28) {
    const from = occupiedSeats[Math.floor(Math.random() * occupiedSeats.length)];
    const to = emptySeats[Math.floor(Math.random() * emptySeats.length)];
    const student = next.get(from);
    next.delete(from);
    next.set(to, student);
  } else if (occupiedSeats.length > 1) {
    const i = Math.floor(Math.random() * occupiedSeats.length);
    let j = Math.floor(Math.random() * occupiedSeats.length);
    if (i === j) j = (j + 1) % occupiedSeats.length;
    const a = occupiedSeats[i], b = occupiedSeats[j];
    const temp = next.get(a);
    next.set(a, next.get(b));
    next.set(b, temp);
  }
  return next;
}

function generatePlan() {
  applyStudents();
  const seats = activeSeatKeys();
  if (!state.students.length) return alert('Bitte mindestens einen Schüler eintragen.');
  if (seats.length < state.students.length) return alert(`Es gibt nur ${seats.length} aktive Plätze für ${state.students.length} Schüler.`);
  const fixedValidation = validateFixedSeatRules();
  if (fixedValidation.errors.length) {
    return alert(`Die festen Platzzuweisungen sind nicht gültig:\n\n${fixedValidation.errors.join('\n')}`);
  }

  let globalBest = null;
  let globalEval = null;
  const restarts = Math.min(30, 8 + state.students.length);
  const iterations = Math.min(12000, 1600 + state.students.length * 260 + state.rules.length * 180);

  for (let restart = 0; restart < restarts; restart++) {
    let current = createInitialAssignment(seats);
    let currentEval = evaluateAssignment(current);
    let best = new Map(current);
    let bestEval = currentEval;
    let temperature = 10;

    for (let i = 0; i < iterations; i++) {
      const candidate = mutateAssignment(current, seats);
      const candidateEval = evaluateAssignment(candidate);
      const delta = candidateEval.objective - currentEval.objective;
      if (delta <= 0 || Math.random() < Math.exp(-delta / Math.max(.1, temperature))) {
        current = candidate;
        currentEval = candidateEval;
      }
      if (candidateEval.objective < bestEval.objective) {
        best = new Map(candidate);
        bestEval = candidateEval;
        if (bestEval.objective === 0) break;
      }
      temperature *= .997;
    }

    if (!globalEval || bestEval.objective < globalEval.objective) {
      globalBest = best;
      globalEval = bestEval;
    }
    if (globalEval.objective === 0) break;
  }

  state.assignment = globalBest || new Map();
  state.lastEvaluation = globalEval || evaluateAssignment(state.assignment);
  renderRoom();
  showEvaluation(state.lastEvaluation);
  saveLocal();
}

function showEvaluation(result) {
  state.lastEvaluation = result;
  els.scoreBadge.textContent = `${result.score}%`;
  els.scoreBadge.className = 'score-badge ' + (result.score >= 90 ? 'good' : result.score >= 70 ? 'warn' : 'bad');

  const activeCount = state.activeSeats.size;
  const empty = Math.max(0, activeCount - state.students.length);
  els.resultSummary.innerHTML = `<ul class="summary-list">
    <li><strong>${state.students.length}</strong> Schüler auf <strong>${activeCount}</strong> aktiven Plätzen</li>
    <li><strong>${result.fulfilled.length}</strong> Vorgaben erfüllt</li>
    <li><strong>${result.hardViolations}</strong> verletzte Muss-Regeln</li>
    <li><strong>${empty}</strong> freie Plätze</li>
    <li>Plätze können per Drag-and-drop getauscht werden.</li>
  </ul>`;

  if (!result.conflicts.length) {
    els.conflictsList.innerHTML = '<div class="empty-state">Alle angelegten Regeln sind erfüllt.</div>';
  } else {
    els.conflictsList.innerHTML = `<ul class="conflict-list">${result.conflicts.map(c => `<li class="${c.hard ? 'hard' : ''}">${c.hard ? 'Muss-Regel nicht erfüllt: ' : 'Wunsch nicht vollständig erfüllt: '}${escapeHtml(c.text)}</li>`).join('')}</ul>`;
  }
}

function clearResults() {
  state.lastEvaluation = null;
  els.scoreBadge.textContent = '–';
  els.scoreBadge.className = 'score-badge neutral';
  els.resultSummary.className = 'empty-state';
  els.resultSummary.textContent = 'Noch kein Sitzplan erzeugt.';
  els.conflictsList.className = 'empty-state';
  els.conflictsList.textContent = 'Konflikte und unerfüllte Wünsche erscheinen hier.';
}

function saveLocal() {
  if (suppressLocalSave) return;
  const payload = serializeState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clearLocalProject() {
  const confirmed = window.confirm(
    'Lokale Projektdaten wirklich löschen?\n\n' +
    'Der aktuell im Browser gespeicherte Stand wird entfernt und die Anwendung startet leer neu. ' +
    'Bereits als JSON-Datei gespeicherte Projekte auf deinem Rechner bleiben erhalten.'
  );
  if (!confirmed) return;

  suppressLocalSave = true;
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

function serializeState() {
  readMetadataFromInputs();
  return {
    version: 6,
    metadata: { ...state.metadata },
    rows: state.rows,
    cols: state.cols,
    seatLayout: state.seatLayout,
    activeSeats: [...state.activeSeats],
    studentsText: els.studentsInput.value,
    students: state.students,
    rules: state.rules,
    assignment: [...state.assignment.entries()],
    options: {
      mixCategories: els.mixCategories.checked,
      groupCategories: els.groupCategories.checked,
      everyoneHasNeighbor: els.everyoneHasNeighbor.checked,
      fillFrontFirst: els.fillFrontFirst.checked,
      avoidEmptyGaps: els.avoidEmptyGaps.checked,
    },
  };
}

function restoreState(data) {
  if (!data || ![1, 2, 3, 4, 5, 6].includes(data.version)) throw new Error('Unbekanntes Dateiformat.');
  state.metadata = {
    className: data.metadata?.className || '',
    roomName: data.metadata?.roomName || '',
    subject: data.metadata?.subject || '',
  };
  state.rows = clamp(Number(data.rows) || 5, 1, 12);
  state.cols = clamp(Number(data.cols) || 6, 1, 12);
  state.seatLayout = data.seatLayout === 'double' ? 'double' : 'single';
  state.activeSeats = new Set(Array.isArray(data.activeSeats) ? data.activeSeats : []);
  state.students = Array.isArray(data.students) ? data.students : [];
  state.rules = Array.isArray(data.rules) ? data.rules : [];
  state.assignment = new Map(Array.isArray(data.assignment) ? data.assignment : []);
  els.classNameInput.value = state.metadata.className;
  els.roomNameInput.value = state.metadata.roomName;
  els.subjectInput.value = state.metadata.subject;
  els.rowsInput.value = state.rows;
  els.colsInput.value = state.cols;
  els.seatLayoutInput.value = state.seatLayout;
  els.studentsInput.value = data.studentsText || state.students.map(s => `${s.name}${s.category ? `;${s.category}` : ''}`).join('\n');
  els.mixCategories.checked = data.options?.mixCategories ?? true;
  els.groupCategories.checked = data.options?.groupCategories ?? false;
  if (els.mixCategories.checked && els.groupCategories.checked) els.groupCategories.checked = false;
  els.everyoneHasNeighbor.checked = data.options?.everyoneHasNeighbor ?? false;
  els.fillFrontFirst.checked = data.options?.fillFrontFirst ?? false;
  els.avoidEmptyGaps.checked = data.options?.avoidEmptyGaps ?? true;
  state.rules = state.rules.filter(rule => rule.type !== 'fixedSeat' || (rule.seat && state.activeSeats.has(rule.seat)));
  renderMetadata();
  updateStudentUI();
  renderRules();
  updateRuleFormVisibility();
  renderRoom();
  if (state.assignment.size) showEvaluation(evaluateAssignment(state.assignment));
  else clearResults();
}


function renderTeacherPrintView() {
  els.teacherRoomGrid.style.gridTemplateColumns = `repeat(${state.cols}, minmax(72px, 1fr))`;
  els.teacherRoomGrid.innerHTML = '';
  readMetadataFromInputs();
  els.teacherPrintDate.textContent = formattedDate();
  els.teacherPrintMeta.textContent = metadataParts().join(' · ') || 'Ohne Projektangaben';

  // 180° gedrehte Sitzanordnung: erste Reihe unten und links/rechts aus Lehrersicht.
  for (let r = state.rows - 1; r >= 0; r--) {
    for (let c = state.cols - 1; c >= 0; c--) {
      const key = seatKey(r, c);
      const active = state.activeSeats.has(key);
      const student = studentById(state.assignment.get(key));
      const seat = document.createElement('div');
      seat.className = 'print-seat';
      applyDeskClasses(seat, c, true);
      seat.classList.toggle('blocked', !active);
      seat.classList.toggle('assigned', Boolean(student && active));

      const number = document.createElement('span');
      number.className = 'print-seat-number';
      number.textContent = `R${r + 1} · P${c + 1}`;

      const name = document.createElement('strong');
      name.className = 'print-seat-name';
      name.textContent = !active ? 'Gesperrt' : (student ? `${isFixedSeat(key) ? '📌 ' : ''}${student.name}` : 'Freier Platz');

      const category = document.createElement('small');
      category.className = 'print-seat-category';
      category.textContent = active && student ? (student.category || '') : '';

      seat.append(number, name, category);
      els.teacherRoomGrid.appendChild(seat);
    }
  }
}

function renderClassbookPrintView() {
  readMetadataFromInputs();
  els.classbookTitle.textContent = state.metadata.className ? `Klasse ${state.metadata.className}` : 'Sitzplan';
  els.classbookRoom.textContent = state.metadata.roomName || '–';
  els.classbookSubject.textContent = state.metadata.subject || '–';
  els.classbookDate.textContent = formattedDate();
  els.classbookRoomGrid.style.gridTemplateColumns = `repeat(${state.cols}, minmax(0, 1fr))`;
  els.classbookRoomGrid.style.gridTemplateRows = `repeat(${state.rows}, minmax(0, 1fr))`;
  els.classbookRoomGrid.innerHTML = '';

  // Kompakt und aus Lehrerperspektive: 180° gedreht.
  for (let r = state.rows - 1; r >= 0; r--) {
    for (let c = state.cols - 1; c >= 0; c--) {
      const key = seatKey(r, c);
      const active = state.activeSeats.has(key);
      const student = studentById(state.assignment.get(key));
      const seat = document.createElement('div');
      seat.className = 'classbook-seat';
      applyDeskClasses(seat, c, true);
      seat.classList.toggle('blocked', !active);
      seat.classList.toggle('assigned', Boolean(student && active));

      const name = document.createElement('strong');
      name.textContent = !active ? '—' : (student ? `${isFixedSeat(key) ? '📌 ' : ''}${student.name}` : '');
      seat.appendChild(name);
      els.classbookRoomGrid.appendChild(seat);
    }
  }
}

function setPrintMode(mode) {
  document.body.classList.remove('print-teacher', 'print-classbook');
  if (mode === 'teacher') document.body.classList.add('print-teacher');
  if (mode === 'classbook') document.body.classList.add('print-classbook');
}

function setPrintPage(size, margin) {
  let style = document.querySelector('#dynamicPrintPageStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'dynamicPrintPageStyle';
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: ${size}; margin: ${margin}; } }`;
}

function printRoomView() {
  readMetadataFromInputs();
  setPrintMode('room');
  setPrintPage('landscape', '12mm');
  window.print();
}

function printTeacherView() {
  renderTeacherPrintView();
  setPrintMode('teacher');
  setPrintPage('landscape', '12mm');
  window.print();
}

function printClassbookView() {
  renderClassbookPrintView();
  setPrintMode('classbook');
  setPrintPage('A4 portrait', '10mm');
  window.print();
}

window.addEventListener('afterprint', () => {
  setPrintMode('room');
  document.querySelector('#dynamicPrintPageStyle')?.remove();
});

function downloadProject() {
  const blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safe = value => value.replace(/[^a-z0-9äöüß_-]+/gi, '-').replace(/^-+|-+$/g, '');
  const nameParts = ['Sitzplan', state.metadata.className, state.metadata.subject, state.metadata.roomName]
    .map(value => safe(value || '')).filter(Boolean);
  link.download = `${nameParts.join('_') || 'Sitzplatzprojekt'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

els.buildRoomBtn.addEventListener('click', () => {
  initRoom(els.rowsInput.value, els.colsInput.value);
  saveLocal();
});
els.applyStudentsBtn.addEventListener('click', () => { applyStudents(); saveLocal(); });
els.ruleType.addEventListener('change', updateRuleFormVisibility);
els.addRuleBtn.addEventListener('click', addRule);
els.generateBtn.addEventListener('click', generatePlan);
els.saveBtn.addEventListener('click', downloadProject);
els.clearLocalBtn.addEventListener('click', clearLocalProject);
els.printBtn.addEventListener('click', printRoomView);
els.teacherPrintBtn.addEventListener('click', printTeacherView);
els.classbookPrintBtn.addEventListener('click', printClassbookView);
els.loadInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    restoreState(JSON.parse(await file.text()));
    saveLocal();
  } catch (error) {
    alert(`Projekt konnte nicht geladen werden: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});
els.mixCategories.addEventListener('change', () => {
  if (els.mixCategories.checked) els.groupCategories.checked = false;
  saveLocal();
});
els.groupCategories.addEventListener('change', () => {
  if (els.groupCategories.checked) els.mixCategories.checked = false;
  saveLocal();
});
els.seatLayoutInput.addEventListener('change', () => {
  const nextLayout = els.seatLayoutInput.value === 'double' ? 'double' : 'single';
  if (state.assignment.size && nextLayout !== state.seatLayout) {
    state.assignment.clear();
    clearResults();
  }
  state.seatLayout = nextLayout;
  renderRoom();
  saveLocal();
});
[els.everyoneHasNeighbor, els.fillFrontFirst, els.avoidEmptyGaps].forEach(el => el.addEventListener('change', saveLocal));
[els.classNameInput, els.roomNameInput, els.subjectInput].forEach(el => {
  el.addEventListener('input', () => { readMetadataFromInputs(); saveLocal(); });
});
window.addEventListener('beforeunload', saveLocal);

(function boot() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { restoreState(JSON.parse(saved)); return; } catch { /* fall through */ }
  }
  initRoom(5, 6);
  renderMetadata();
  updateStudentUI();
  renderRules();
  updateRuleFormVisibility();
})();
