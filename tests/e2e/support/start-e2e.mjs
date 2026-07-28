import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';

const host = '127.0.0.1';
const apiPort = 4184;
const webPort = 4183;
const root = resolve(import.meta.dirname, '../../..');

const fixture = async (name) =>
  JSON.parse(await readFile(resolve(root, 'tests/fixtures', name), 'utf8'));

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
let idCounter = 1;
const id = (prefix) => `${prefix}-${String(idCounter++).padStart(4, '0')}`;

const users = {
  dm: { id: 'user-dm', email: 'dm@combat.test', display_name: 'QA Dungeon Master' },
  player: { id: 'user-player', email: 'player@combat.test', display_name: 'QA Player' },
  spectator: { id: 'user-spectator', email: 'spectator@combat.test', display_name: 'QA Spectator' },
};

let state;
let changeSequence = 0;
let changes = [];

function publish(table, eventType, row, old = {}) {
  changeSequence += 1;
  changes.push({ sequence: changeSequence, table, eventType, new: clone(row), old: clone(old) });
  changes = changes.slice(-1000);
}

async function reset() {
  idCounter = 1;
  changeSequence = 0;
  changes = [];
  const tarrasque = await fixture('tarrasque.json');
  const titan = await fixture('combat-qa-titan.json');
  state = {
    profiles: Object.values(users),
    campaigns: [{ id: 'campaign-qa', owner_id: users.dm.id, name: 'Combat Playtest' }],
    characters: [
      { id: 'character-tarrasque', owner_id: users.dm.id, campaign_id: 'campaign-qa', data: tarrasque, updated_at: now() },
      { id: 'character-qa-titan', owner_id: users.dm.id, campaign_id: 'campaign-qa', data: titan, updated_at: now() },
    ],
    combat_encounters: [],
    combat_members: [],
    combat_maps: [],
    combat_tokens: [],
    combat_proposals: [],
    combat_reaction_windows: [],
    combat_reaction_responses: [],
    combat_events: [],
    combat_resolutions: [],
  };
}

await reset();

const userFor = (request) => users[request.headers['x-combat-role']] ?? users.spectator;
const table = (name) => state[name] ?? [];
const encounterFor = (encounterId) => state.combat_encounters.find((item) => item.id === encounterId);
const isDm = (user, encounterId) => encounterFor(encounterId)?.dm_user_id === user.id;
const isMember = (user, encounterId) =>
  isDm(user, encounterId) ||
  state.combat_members.some((member) => member.encounter_id === encounterId && member.user_id === user.id);

const rowEncounterId = (name, row) => {
  if (name === 'combat_encounters') return row.id;
  if (name === 'combat_reaction_responses') {
    const window = state.combat_reaction_windows.find((item) => item.id === row.reaction_window_id);
    return window?.encounter_id;
  }
  return row.encounter_id;
};

function visibleRows(name, user) {
  if (['profiles', 'characters'].includes(name)) return table(name);
  if (name === 'campaigns') return table(name).filter((row) => row.owner_id === user.id || user.id === users.dm.id);
  if (name.startsWith('combat_')) return table(name).filter((row) => {
    const encounterId = rowEncounterId(name, row);
    return encounterId ? isMember(user, encounterId) : false;
  });
  return table(name);
}

function applyFilters(rows, filters = []) {
  return filters.reduce((current, filter) =>
    filter.type === 'eq'
      ? current.filter((row) => row[filter.column] === filter.value)
      : current, rows);
}

function sortRows(rows, orders = []) {
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const compared = String(left[order.column] ?? '').localeCompare(String(right[order.column] ?? ''), undefined, { numeric: true });
      if (compared) return order.ascending === false ? -compared : compared;
    }
    return 0;
  });
}

const error = (message, code = 'PGRST000') => ({ data: null, error: { message, code } });
const ok = (data) => ({ data: clone(data), error: null });

function requireDm(user, encounterId) {
  if (!isDm(user, encounterId)) throw new Error('Only the encounter DM may perform this action.');
}

function query(user, input) {
  const { name, action, payload, filters = [], orders = [], limit, single, maybeSingle, onConflict } = input;
  if (!(name in state)) return error(`Unknown table ${name}`);

  if (action === 'select') {
    let rows = applyFilters(visibleRows(name, user), filters);
    rows = sortRows(rows, orders);
    if (typeof limit === 'number') rows = rows.slice(0, limit);
    if (name === 'combat_reaction_windows') {
      rows = rows.map((row) => ({
        ...row,
        combat_reaction_responses: state.combat_reaction_responses.filter((response) => response.reaction_window_id === row.id),
      }));
    }
    if (single) return rows.length === 1 ? ok(rows[0]) : error(rows.length ? 'Multiple rows returned' : 'Row not found', 'PGRST116');
    if (maybeSingle) return rows.length <= 1 ? ok(rows[0] ?? null) : error('Multiple rows returned', 'PGRST116');
    return ok(rows);
  }

  if (action === 'insert') {
    const rows = Array.isArray(payload) ? payload : [payload];
    const inserted = rows.map((candidate) => {
      const defaults = name === 'combat_proposals'
        ? { status: 'draft', version: 1, dm_final_payload: { targets: [] } }
        : name === 'combat_reaction_windows'
          ? { status: 'open', opened_at: now(), closed_at: null, close_reason: null }
          : name === 'combat_reaction_responses'
            ? { response_type: 'pass', payload: {}, responded_at: now() }
            : {};
      const row = {
        ...defaults,
        ...candidate,
        id: candidate.id ?? id(name.replace('combat_', '')),
        created_at: candidate.created_at ?? now(),
        updated_at: now(),
      };
      const encounterId = rowEncounterId(name, row);
      const memberChat = name === 'combat_events' &&
        row.event_type === 'chat' &&
        row.created_by === user.id &&
        isMember(user, encounterId);
      if (name.startsWith('combat_') && encounterId &&
          name !== 'combat_proposals' &&
          name !== 'combat_reaction_responses' &&
          !memberChat) requireDm(user, encounterId);
      if (name === 'combat_proposals' && row.created_by !== user.id) throw new Error('Proposal creator must match the signed-in user.');
      state[name].push(row);
      publish(name, 'INSERT', row);
      return row;
    });
    return ok(single ? inserted[0] : inserted);
  }

  const candidates = applyFilters(table(name), filters);
  if (action === 'update') {
    const updated = candidates.map((row) => {
      const encounterId = rowEncounterId(name, row);
      if (name.startsWith('combat_') && encounterId) {
        const playerProposal = name === 'combat_proposals' && row.created_by === user.id && payload.status === 'draft';
        const ownReaction = name === 'combat_reaction_responses' && row.responder_user_id === user.id;
        if (!playerProposal && !ownReaction) requireDm(user, encounterId);
      }
      const before = clone(row);
      Object.assign(row, payload, { updated_at: now() });
      publish(name, 'UPDATE', row, before);
      return row;
    });
    return ok(single ? updated[0] ?? null : updated);
  }

  if (action === 'delete') {
    for (const row of candidates) {
      const encounterId = rowEncounterId(name, row);
      if (name.startsWith('combat_') && encounterId) requireDm(user, encounterId);
      state[name] = state[name].filter((item) => item !== row);
      publish(name, 'DELETE', {}, row);
    }
    return ok([]);
  }

  if (action === 'upsert') {
    const conflictColumns = String(onConflict ?? 'id').split(',');
    const existing = table(name).find((row) => conflictColumns.every((column) => row[column] === payload[column]));
    if (existing) return query(user, { ...input, action: 'update', filters: conflictColumns.map((column) => ({ type: 'eq', column, value: payload[column] })) });
    return query(user, { ...input, action: 'insert' });
  }

  return error(`Unsupported action ${action}`);
}

function applyTargetChange(token, change) {
  const before = clone(token);
  const hp = { current: 1, max: 1, temp: 0, ...(token.state?.hp ?? {}) };
  const damage = Math.max(0, Number(change.damage) || 0);
  const absorbed = Math.min(hp.temp, damage);
  hp.temp -= absorbed;
  hp.current = Math.max(0, hp.current - (damage - absorbed));
  if (change.healing) hp.current = Math.min(hp.max, hp.current + Math.max(0, Number(change.healing)));
  if (change.temp_hp !== undefined) hp.temp = Math.max(0, Number(change.temp_hp) || 0);
  if (change.remove_temp_hp) hp.temp = 0;
  if (change.set_hp !== undefined) hp.current = Math.max(0, Math.min(hp.max, Number(change.set_hp) || 0));
  if (change.set_max_hp !== undefined) {
    hp.max = Math.max(1, Number(change.set_max_hp) || 1);
    hp.current = Math.min(hp.current, hp.max);
  }
  const conditions = new Set(token.state?.conditions ?? []);
  for (const condition of change.conditions_add ?? []) if (condition) conditions.add(condition);
  for (const condition of change.conditions_remove ?? []) conditions.delete(condition);
  const resourcePools = (token.state?.resourcePools ?? []).map((pool) => {
    const resourceChange = (change.resource_changes ?? []).find((item) =>
      (item.id && item.id === pool.id) || (item.name && item.name === pool.name));
    if (!resourceChange) return pool;
    const next = resourceChange.set ?? pool.current + (resourceChange.delta ?? 0);
    return { ...pool, current: Math.max(0, Math.min(pool.max, next)) };
  });
  token.state = {
    ...(token.state ?? {}),
    hp,
    conditions: [...conditions],
    resourcePools,
    dead: change.dead ?? token.state?.dead ?? false,
    unconscious: change.unconscious ?? token.state?.unconscious ?? false,
  };
  if (change.x !== undefined) token.x = Math.max(0, Number(change.x) || 0);
  if (change.y !== undefined) token.y = Math.max(0, Number(change.y) || 0);
  token.updated_at = now();
  publish('combat_tokens', 'UPDATE', token, before);
  return { before, after: clone(token) };
}

function applyResolution(user, encounterId, payload, proposalId = null, idempotencyKey = id('resolution-key')) {
  requireDm(user, encounterId);
  const existing = state.combat_resolutions.find((item) => item.encounter_id === encounterId && item.idempotency_key === idempotencyKey);
  if (existing) return existing;
  const snapshots = [];
  for (const change of payload.targets ?? []) {
    const token = state.combat_tokens.find((item) => item.id === change.token_id && item.encounter_id === encounterId);
    if (!token) throw new Error('Resolution target is not in this encounter.');
    snapshots.push(applyTargetChange(token, change));
  }
  const resolution = {
    id: id('resolution'),
    encounter_id: encounterId,
    proposal_id: proposalId,
    idempotency_key: idempotencyKey,
    before_state: snapshots.map((entry) => entry.before),
    after_state: snapshots.map((entry) => entry.after),
    applied_changes: clone(payload),
    resolved_by: user.id,
    resolved_at: now(),
    undone_at: null,
  };
  state.combat_resolutions.push(resolution);
  if (proposalId) {
    const proposal = state.combat_proposals.find((item) => item.id === proposalId);
    if (proposal) {
      const before = clone(proposal);
      proposal.status = 'resolved';
      proposal.dm_final_payload = clone(payload);
      proposal.version += 1;
      proposal.updated_at = now();
      publish('combat_proposals', 'UPDATE', proposal, before);
    }
  }
  const event = {
    id: id('event'),
    encounter_id: encounterId,
    proposal_id: proposalId,
    resolution_id: resolution.id,
    event_type: 'resolution',
    message: proposalId ? 'DM resolved a combat proposal' : 'DM applied a direct resolution',
    payload: clone(payload),
    created_by: user.id,
    created_at: now(),
  };
  state.combat_events.push(event);
  publish('combat_events', 'INSERT', event);
  return resolution;
}

function rpc(user, name, args) {
  if (name === 'create_combat_encounter') {
    if (user.id !== users.dm.id) throw new Error('Only the test DM may create encounters.');
    const encounter = {
      id: id('encounter'),
      campaign_id: args.p_campaign_id ?? null,
      dm_user_id: user.id,
      name: args.p_name || 'New Encounter',
      status: 'setup',
      turn_mode: args.p_turn_mode === 'free' ? 'free' : 'initiative',
      round_number: 1,
      active_turn_token_id: null,
      settings: {},
      created_at: now(),
      updated_at: now(),
    };
    state.combat_encounters.push(encounter);
    state.combat_members.push({ id: id('member'), encounter_id: encounter.id, user_id: user.id, role: 'dm', created_at: now(), updated_at: now() });
    const map = {
      id: id('map'),
      encounter_id: encounter.id,
      map_type: 'preset',
      storage_path: null,
      preset_name: args.p_preset_name ?? 'blank',
      grid_columns: args.p_grid_columns ?? 24,
      grid_rows: args.p_grid_rows ?? 18,
      feet_per_square: args.p_feet_per_square ?? 5,
      settings: {},
      created_at: now(),
      updated_at: now(),
    };
    state.combat_maps.push(map);
    publish('combat_encounters', 'INSERT', encounter);
    return encounter;
  }

  if (name === 'move_combat_token') {
    const token = state.combat_tokens.find((item) => item.id === args.p_token_id);
    if (!token) throw new Error('Token not found.');
    if (!isDm(user, token.encounter_id) && token.assigned_user_id !== user.id) throw new Error('You do not control this token.');
    const before = clone(token);
    token.x = args.p_x;
    token.y = args.p_y;
    token.updated_at = now();
    publish('combat_tokens', 'UPDATE', token, before);
    return token;
  }

  if (name === 'submit_combat_proposal') {
    const proposal = state.combat_proposals.find((item) => item.id === args.p_proposal_id);
    if (!proposal || proposal.created_by !== user.id) throw new Error('Only the creator may submit this proposal.');
    const before = clone(proposal);
    proposal.status = 'awaiting_dm';
    proposal.version += 1;
    proposal.updated_at = now();
    publish('combat_proposals', 'UPDATE', proposal, before);
    const event = {
      id: id('event'),
      encounter_id: proposal.encounter_id,
      proposal_id: proposal.id,
      resolution_id: null,
      event_type: 'proposal',
      message: `Action proposed: ${proposal.source_action?.name ?? 'Custom action'}`,
      payload: { targets: clone(proposal.target_token_ids), roll: clone(proposal.roll_data) },
      created_by: user.id,
      created_at: now(),
    };
    state.combat_events.push(event);
    publish('combat_events', 'INSERT', event);
    return proposal;
  }

  if (name === 'resolve_combat_proposal') {
    const proposal = state.combat_proposals.find((item) => item.id === args.p_proposal_id);
    if (!proposal) throw new Error('Proposal not found.');
    return applyResolution(user, proposal.encounter_id, args.p_dm_payload, proposal.id, args.p_idempotency_key);
  }

  if (name === 'apply_direct_combat_resolution') {
    return applyResolution(user, args.p_encounter_id, args.p_payload, null, args.p_idempotency_key);
  }

  if (name === 'undo_latest_combat_resolution') {
    requireDm(user, args.p_encounter_id);
    const resolution = [...state.combat_resolutions].reverse().find((item) => item.encounter_id === args.p_encounter_id && !item.undone_at);
    if (!resolution) throw new Error('No resolution is available to undo.');
    for (const snapshot of resolution.before_state) {
      const current = state.combat_tokens.find((item) => item.id === snapshot.id);
      if (!current) continue;
      const before = clone(current);
      Object.assign(current, clone(snapshot), { updated_at: now() });
      publish('combat_tokens', 'UPDATE', current, before);
    }
    resolution.undone_at = now();
    if (resolution.proposal_id) {
      const proposal = state.combat_proposals.find((item) => item.id === resolution.proposal_id);
      if (proposal) {
        const before = clone(proposal);
        proposal.status = 'undone';
        proposal.updated_at = now();
        publish('combat_proposals', 'UPDATE', proposal, before);
      }
    }
    const event = {
      id: id('event'),
      encounter_id: args.p_encounter_id,
      proposal_id: resolution.proposal_id,
      resolution_id: resolution.id,
      event_type: 'resolution',
      message: 'DM undid the latest resolution',
      payload: { restored: resolution.before_state },
      created_by: user.id,
      created_at: now(),
    };
    state.combat_events.push(event);
    publish('combat_events', 'INSERT', event);
    return resolution;
  }

  if (name === 'advance_combat_round') {
    requireDm(user, args.p_encounter_id);
    for (const token of state.combat_tokens.filter((item) => item.encounter_id === args.p_encounter_id)) {
      const before = clone(token);
      if ((args.p_direction ?? 1) > 0) {
        token.state.resourcePools = (token.state.resourcePools ?? []).map((pool) =>
          pool.rechargeType === 'round' ? { ...pool, current: pool.max } : pool);
        token.state.legendaryActionsUsed = 0;
      }
      token.updated_at = now();
      publish('combat_tokens', 'UPDATE', token, before);
    }
    const encounter = encounterFor(args.p_encounter_id);
    const before = clone(encounter);
    encounter.round_number = Math.max(1, encounter.round_number + (args.p_direction ?? 1));
    encounter.updated_at = now();
    publish('combat_encounters', 'UPDATE', encounter, before);
    return encounter;
  }

  throw new Error(`Unknown RPC ${name}`);
}

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-combat-role',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(body));
}

const api = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const url = new URL(request.url, `http://${host}:${apiPort}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true });
    if (request.method === 'GET' && url.pathname === '/events') {
      const since = Number(url.searchParams.get('since') || 0);
      return json(response, 200, ok({ sequence: changeSequence, changes: changes.filter((item) => item.sequence > since) }));
    }
    if (request.method === 'POST') {
      const body = await new Promise((resolveBody, reject) => {
        let raw = '';
        request.on('data', (chunk) => { raw += chunk; });
        request.on('end', () => resolveBody(raw ? JSON.parse(raw) : {}));
        request.on('error', reject);
      });
      if (url.pathname === '/reset') {
        await reset();
        return json(response, 200, { ok: true });
      }
      const user = userFor(request);
      if (url.pathname === '/query') return json(response, 200, query(user, body));
      if (url.pathname === '/rpc') return json(response, 200, ok(rpc(user, body.name, body.args ?? {})));
    }
    return json(response, 404, { error: { message: 'Not found' } });
  } catch (caught) {
    return json(response, 200, error(caught instanceof Error ? caught.message : 'Test backend error'));
  }
});

await new Promise((resolveListen) => api.listen(apiPort, host, resolveListen));

const vite = await createViteServer({
  root,
  mode: 'e2e',
  configLoader: 'runner',
  server: { host, port: webPort, strictPort: true },
});
await vite.listen();

console.log(`Combat E2E app: http://${host}:${webPort}`);
console.log(`Combat E2E API: http://${host}:${apiPort}`);

const close = async () => {
  await vite.close();
  await new Promise((resolveClose) => api.close(resolveClose));
  process.exit(0);
};

process.on('SIGINT', close);
process.on('SIGTERM', close);
