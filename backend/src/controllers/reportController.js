import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVoterDb } from '../config/db.js';
import { listAssemblies, getAssembly } from '../models/assemblyModel.js';
import { collectionForAc, assemblyAnalytics } from '../models/voterModel.js';
import { findById } from '../models/userModel.js';
import { ROLES } from '../constants/roles.js';

// Resolve reports directory across production (/var/www/edm/reports) and local environment.
function getReportsDir() {
  if (process.env.REPORTS_DIR && fs.existsSync(process.env.REPORTS_DIR)) {
    return process.env.REPORTS_DIR;
  }
  const candidates = [
    '/var/www/edm/reports',
    fileURLToPath(new URL('../../../reports', import.meta.url)),
    fileURLToPath(new URL('../../reports', import.meta.url)),
    fileURLToPath(new URL('../reports', import.meta.url)),
    path.resolve(process.cwd(), '../reports'),
    path.resolve(process.cwd(), 'reports'),
  ];
  return candidates.find((d) => fs.existsSync(d)) || candidates[0];
}

export const REPORTS_DIR = getReportsDir();

// Build a static URL (served by express.static at /report-files) from a path
// relative to REPORTS_DIR, encoding spaces etc. but keeping the slashes.
const reportUrl = (rel) => '/report-files/' + rel.split('/').map(encodeURIComponent).join('/');

// Resolve which assembly/booth the logged-in user may see (mirrors
// ReportController role handling: MLA -> own assembly, Booth -> own booth).
async function reportScope(req) {
  const u = req.user || {};
  const g = Number(u.group_id || 0);
  if (g === ROLES.SUPER_ADMIN || !g) {
    return { forced: false, assemblyNo: req.query.assemblyId || '', booth: req.query.booth || '', booths: [] };
  }
  let rec = null;
  if (u.sub && u.sub !== 'admin') { try { rec = await findById(u.sub); } catch { /* offline */ } }
  const assemblyNo = rec?.assembly_id ?? u.assembly_id ?? '';

  let userBooths = Array.isArray(rec?.booths) && rec.booths.length > 0
    ? rec.booths
    : (Array.isArray(u.booths) && u.booths.length > 0 ? u.booths : []);

  if (!userBooths.length && (rec?.mobile_no || u.mobile_no || u.username)) {
    try {
      const db = getAppDb();
      const mob = (rec?.mobile_no || u.mobile_no || u.username || '').toString().replace(/\D/g, '');
      if (mob) {
        const enq = await db.collection('tbl_enquiry').findOne({ mobile: mob });
        if (enq && Array.isArray(enq.booths) && enq.booths.length > 0) {
          userBooths = enq.booths;
        }
      }
    } catch { /* ignore */ }
  }

  if (g === ROLES.BOOTH || g === ROLES.BOOTH_ALT) {
    return { forced: true, assemblyNo, booth: rec?.booth_id ?? u.booth_id ?? '', booths: userBooths };
  }
  return { forced: true, assemblyNo, booth: req.query.booth || '', booths: userBooths };
}

// GET /reports/documents — role-scoped list of available HTML reports.
export async function documents(req, res) {
  const scope = await reportScope(req);
  const no = scope.assemblyNo;
  if (!no) {
    return res.status(400).json({ success: false, message: scope.forced ? 'No assembly is assigned to your account.' : 'assemblyId is required.' });
  }
  const out = [];
  const asmBase = `Assembly_Reports/ASS ${no} Reports`;
  const candidates = [
    { key: 'candidate-briefing', label: 'Candidate Briefing', files: [`${asmBase}/Main Deliverables/CANDIDATE_BRIEFING.html`, `${asmBase}/CANDIDATE_BRIEFING.html`] },
    { key: 'field-operations', label: 'Field Operations Manual', files: [`${asmBase}/Main Deliverables/FIELD_OPERATIONS_MANUAL.html`, `${asmBase}/FIELD_OPERATIONS_MANUAL.html`] },
  ];
  for (const c of candidates) {
    const rel = c.files.find((f) => fs.existsSync(path.join(REPORTS_DIR, f)));
    out.push({ key: c.key, label: c.label, kind: 'assembly', url: rel ? reportUrl(rel) : null, exists: !!rel });
  }
  if (scope.booth) {
    const rel = `Booth_Reports/ASS ${no} Booth Reports/Booth_${scope.booth}_Report.html`;
    const exists = fs.existsSync(path.join(REPORTS_DIR, rel));
    out.push({ key: `booth-${scope.booth}`, label: `Booth ${scope.booth} Report`, kind: 'booth', url: exists ? reportUrl(rel) : null, exists });
  }
  res.json({ success: true, assemblyNo: no, booth: scope.booth || null, forced: scope.forced, documents: out });
}

// GET /reports/assembly-analytics — role-scoped gender/age/booth-map analytics
// (mirrors ReportController@assemblyDetails). MLA/booth -> own assembly.
export async function assemblyAnalyticsReport(req, res) {
  const scope = await reportScope(req);
  const no = scope.assemblyNo;
  if (!no) return res.status(400).json({ success: false, message: scope.forced ? 'No assembly is assigned to your account.' : 'assemblyId is required.' });
  try {
    let assembly = null;
    try { assembly = await getAssembly(no); } catch { /* app db offline */ }
    const a = await assemblyAnalytics(no, scope.booth, scope.booths);
    res.json({
      success: true,
      assembly_no: Number(no),
      assembly_name: assembly?.assembly_name || `Assembly ${no}`,
      district: assembly?.district || '-',
      booth: scope.booth || null,
      user_booths: scope.booths || [],
      ...a,
    });
  } catch (e) {
    if (e.message === 'VOTER_DB_OFFLINE') return res.status(503).json({ success: false, message: 'Voter database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// GET /reports/booths — booth numbers that have a generated report (for the picker).
export async function boothReportList(req, res) {
  const scope = await reportScope(req);
  const no = scope.assemblyNo;
  if (!no) return res.status(400).json({ success: false, message: 'assemblyId is required.' });
  const dir = path.join(REPORTS_DIR, `Booth_Reports/ASS ${no} Booth Reports`);
  let booths = [];
  try {
    booths = fs.readdirSync(dir)
      .map((f) => /^Booth_(\d+)_Report\.html$/.exec(f))
      .filter(Boolean)
      .map((m) => parseInt(m[1], 10))
      .sort((a, b) => a - b);
  } catch { /* none generated */ }
  res.json({ success: true, assemblyNo: no, booths });
}

// Assembly-wise summary report (stored counts) — mirrors ReportController assembly summary.
export async function assemblySummary(req, res) {
  try {
    const assemblies = await listAssemblies();
    const rows = assemblies.map((a) => ({
      assembly_no: a.assembly_no, assembly_name: a.assembly_name, district: a.district || '-',
      total: Number(a.total_voters || 0), male: Number(a.male_voters || 0),
      female: Number(a.female_voters || 0), other: Number(a.third_gender_voters ?? a.other_voters ?? 0),
    }));
    const totals = rows.reduce((t, r) => ({
      total: t.total + r.total, male: t.male + r.male, female: t.female + r.female, other: t.other + r.other,
    }), { total: 0, male: 0, female: 0, other: 0 });
    res.json({ success: true, rows, totals });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// Booth-wise report for one assembly — per-PART_NO gender counts (mirrors
// ReportController@boothReport, which is scoped to the login's assembly_id).
export async function boothReport(req, res) {
  const scope = await reportScope(req);
  const assemblyId = scope.assemblyNo;
  if (!assemblyId) return res.status(400).json({ success: false, message: scope.forced ? 'No assembly is assigned to your account.' : 'assemblyId is required.' });
  try {
    let assembly = null;
    try { assembly = await getAssembly(assemblyId); } catch { /* app db offline */ }
    const db = getVoterDb();
    const coll = db.collection(collectionForAc(assemblyId));

    const pipeline = [];
    if (Array.isArray(scope.booths) && scope.booths.length > 0) {
      const validParts = scope.booths
        .map((p) => (typeof p === 'object' && p !== null ? parseInt(p.part_no, 10) : parseInt(p, 10)))
        .filter((n) => !Number.isNaN(n));
      if (validParts.length > 0) {
        pipeline.push({ $match: { PART_NO: { $in: validParts } } });
      }
    } else if (scope.booth) {
      const partNo = parseInt(scope.booth, 10);
      if (!Number.isNaN(partNo)) {
        pipeline.push({ $match: { PART_NO: partNo } });
      }
    }

    pipeline.push(
      { $group: {
          _id: '$PART_NO',
          booth_name: { $first: '$BOOTH_NAME' },
          total: { $sum: 1 },
          male: { $sum: { $cond: [{ $eq: ['$GENDER', 'Male'] }, 1, 0] } },
          female: { $sum: { $cond: [{ $eq: ['$GENDER', 'Female'] }, 1, 0] } },
      } },
      { $sort: { _id: 1 } }
    );

    const agg = await coll.aggregate(pipeline).toArray();
    const rows = agg
      .filter((r) => r._id !== null && r._id !== '')
      .map((r) => ({ part_no: r._id, booth_name: r.booth_name || '', total: r.total, male: r.male, female: r.female, other: r.total - r.male - r.female }));
    const totals = rows.reduce((t, r) => ({
      total: t.total + r.total, male: t.male + r.male, female: t.female + r.female, other: t.other + r.other,
    }), { total: 0, male: 0, female: 0, other: 0 });
    res.json({
      success: true,
      assembly_no: Number(assemblyId),
      assembly_name: assembly?.assembly_name || `Assembly ${assemblyId}`,
      district: assembly?.district || '-',
      user_booths: scope.booths || [],
      totals, rows,
    });
  } catch (e) {
    if (e.message === 'VOTER_DB_OFFLINE') return res.status(503).json({ success: false, message: 'Voter database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}
