import { getAppDb, isVoterDbOnline } from '../config/db.js';
import { searchEpicGlobal, genderCountsForParts } from '../models/voterModel.js';
import { getAssembly, listAssemblies, assemblyGenderCounts } from '../models/assemblyModel.js';
import { countsByGroup, countChildren, findById, wardLogins } from '../models/userModel.js';
import { ROLES, ROLE_NAME } from '../constants/roles.js';

// Mirrors DashboardController@index voter-stat tiles: sum stored per-assembly
export async function stats(req, res) {
  try {
    const db = getAppDb();
    const assemblies = await db.collection('tbl_assembly_consitituency').find({}).toArray();
    let totalVoters = 0, maleVoters = 0, femaleVoters = 0, otherVoters = 0;
    for (const a of assemblies) {
      totalVoters += Number(a.total_voters || 0);
      maleVoters += Number(a.male_voters || 0);
      femaleVoters += Number(a.female_voters || 0);
      otherVoters += Number(a.third_gender_voters ?? a.other_voters ?? 0);
    }
    res.json({
      success: true,
      voterDbOnline: isVoterDbOnline(),
      stats: { totalVoters, maleVoters, femaleVoters, otherVoters },
    });
  } catch (e) {
    res.json({
      success: true,
      voterDbOnline: isVoterDbOnline(),
      stats: { totalVoters: 0, maleVoters: 0, femaleVoters: 0, otherVoters: 0 },
      message: 'App database unavailable.',
    });
  }
}

// Role-scoped dashboard
export async function roleDashboard(req, res) {
  const u = req.user || {};
  const groupId = Number(u.group_id || 0);
  try {
    const db = getAppDb();
    switch (groupId) {
      case ROLES.SUPER_ADMIN: {
        const assemblies = await listAssemblies();
        let totalVoters = 0;
        for (const a of assemblies) totalVoters += Number(a.total_voters || 0);
        const byGroup = await countsByGroup();
        return res.json({
          success: true, role: ROLE_NAME[groupId],
          cards: {
            assemblies: assemblies.length,
            totalVoters,
            mlaLogins: byGroup[ROLES.MLA] || 0,
            boothLogins: byGroup[ROLES.BOOTH] || 0,
            wardLogins: byGroup[ROLES.WARD] || 0,
          },
          usersByRole: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [ROLE_NAME[k] || k, v])),
        });
      }
      case ROLES.MP: {
        const me = u.sub !== 'admin' ? await findById(u.sub) : null;
        const all = await listAssemblies();
        const scoped = me?.parliament_id ? all.filter((a) => String(a.parliament_id) === String(me.parliament_id)) : all;
        let totalVoters = 0;
        for (const a of scoped) totalVoters += Number(a.total_voters || 0);
        return res.json({ success: true, role: ROLE_NAME[groupId], cards: { assemblies: scoped.length, totalVoters }, assemblies: scoped.map((a) => ({ assembly_no: a.assembly_no, assembly_name: a.assembly_name, total_voters: a.total_voters })) });
      }
      case ROLES.MLA: {
        const assembly = await getAssembly(u.assembly_id);
        let live = null; try { live = await assemblyGenderCounts(u.assembly_id); } catch { /* voter db offline */ }
        return res.json({ success: true, role: ROLE_NAME[groupId], assembly_id: u.assembly_id, assembly, liveCounts: live });
      }
      case ROLES.BOOTH:
      case ROLES.BOOTH_ALT: {
        let counts = null; try { counts = await genderCountsForParts(u.assembly_id, [u.booth_id]); } catch { /* offline */ }
        return res.json({ success: true, role: ROLE_NAME[groupId], assembly_id: u.assembly_id, booth_id: u.booth_id, counts });
      }
      case ROLES.WARD: {
        const me = u.sub !== 'admin' ? await findById(u.sub) : null;
        const booths = me?.booths || [];
        let counts = null;
        if (me?.assembly_id) { try { counts = await genderCountsForParts(me.assembly_id, booths); } catch { /* offline */ } }
        return res.json({ success: true, role: ROLE_NAME[groupId], ward_id: me?.ward_id, category_name: me?.category_name, booths, counts });
      }
      case ROLES.KING:
      case ROLES.DSA:
      case ROLES.TELE: {
        const me = u.sub !== 'admin' ? await findById(u.sub) : null;
        const children = me ? await countChildren(me.id) : 0;
        return res.json({ success: true, role: ROLE_NAME[groupId], cards: { subUsers: children } });
      }
      case ROLES.TELECALLER: {
        const wards = await wardLogins();
        return res.json({ success: true, role: ROLE_NAME[groupId], cards: { wardLogins: wards.length } });
      }
      default:
        return res.json({ success: true, role: ROLE_NAME[groupId] || 'User', cards: {} });
    }
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE' || e.message === 'VOTER_DB_OFFLINE') {
      return res.status(503).json({ success: false, role: ROLE_NAME[groupId] || 'User', message: 'Database unavailable.' });
    }
    return res.status(500).json({ success: false, message: e.message });
  }
}

// Search EPIC across all assembly collections in voter_db
export async function searchEpic(req, res) {
  const epic = (req.query.epic || req.query.epicNo || '').trim();
  const assemblyId = req.query.assemblyId || req.query.assembly_no || null;
  if (!epic) return res.json({ success: false, message: 'EPIC number is required.' });

  try {
    const t0 = Date.now();
    const result = await searchEpicGlobal(epic, assemblyId);
    const elapsed_ms = Date.now() - t0;

    if (result?.voter) {
      let assembly_name = `Assembly ${result.voter.ASSEMBLY_NO || result.assembly_no}`;
      try {
        const a = await getAssembly(result.voter.ASSEMBLY_NO || result.assembly_no);
        if (a?.assembly_name) assembly_name = a.assembly_name;
      } catch { /* ignore */ }
      return res.json({ success: true, voter: result.voter, assembly_name, elapsed_ms });
    }

    return res.json({ success: false, elapsed_ms, message: `Voter not found with EPIC number: ${epic}` });
  } catch (e) {
    return res.json({ success: false, message: 'Voter database error or unavailable.' });
  }
}
