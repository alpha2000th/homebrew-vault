import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  ArrowLeft, ImagePlus, Map as MapIcon, Menu, Plus, Settings, Shield, Swords,
  Users, Wifi, WifiOff, X,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { AreaTemplate, CombatEncounter, CombatMap } from '../../types/combat';
import { supabase } from '../../lib/supabase/client';
import {
  addTemporaryToken,
  addVaultToken,
  createEncounter,
  deleteToken,
  listAvailableCharacters,
  listEncounters,
  listProfiles,
  updateEncounter,
  updateMap,
  uploadCombatMap,
} from './api';
import { useCombatEncounter } from './useCombatEncounter';
import { MapBoard } from './MapBoard';
import { CombatPanel } from './CombatPanel';
import './combat.css';

const message = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error.';

class CombatErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Combat view crashed', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="combat-fatal">
        <Shield /><h2>Combat view hit an error</h2><p>{this.state.error}</p>
        <button onClick={() => this.setState({ error: null })}>Try again</button>
        <button onClick={this.props.onClose}>Return to Vault</button>
      </div>
    );
  }
}

function EncounterCreate({ session, onCreated, onCancel }: {
  session: Session;
  onCreated: (encounter: CombatEncounter) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('New Encounter');
  const [turnMode, setTurnMode] = useState<'initiative' | 'free'>('initiative');
  const [preset, setPreset] = useState<CombatMap['preset_name']>('stone');
  const [columns, setColumns] = useState(24);
  const [rows, setRows] = useState(18);
  const [feet, setFeet] = useState(5);
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('campaigns').select('id,name').then(({ data }) => setCampaigns(data ?? []));
  }, [session.user.id]);

  return (
    <div className="combat-modal-backdrop">
      <form className="combat-modal" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const encounter = await createEncounter({
            name, campaignId: campaignId || null, turnMode, preset, columns, rows, feetPerSquare: feet,
          });
          onCreated(encounter);
        } catch (caught) { setError(message(caught)); }
        finally { setBusy(false); }
      }}>
        <header><div><Swords /><h2>Create encounter</h2></div><button type="button" onClick={onCancel}><X /></button></header>
        <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} data-testid="encounter-name" /></label>
        <label>Campaign (optional)<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          <option value="">No linked campaign</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select></label>
        <div className="field-grid">
          <label>Turn mode<select value={turnMode} onChange={(event) => setTurnMode(event.target.value as typeof turnMode)}>
            <option value="initiative">Initiative Mode</option><option value="free">Free Mode</option>
          </select></label>
          <label>Default map<select value={preset ?? 'blank'} onChange={(event) => setPreset(event.target.value as CombatMap['preset_name'])}>
            <option value="blank">Blank grid</option><option value="grass">Grass</option>
            <option value="stone">Stone dungeon</option><option value="dirt">Dirt / wasteland</option>
          </select></label>
        </div>
        <div className="field-grid three">
          <label>Columns<input type="number" min="5" max="100" value={columns} onChange={(event) => setColumns(Number(event.target.value))} /></label>
          <label>Rows<input type="number" min="5" max="100" value={rows} onChange={(event) => setRows(Number(event.target.value))} /></label>
          <label>Feet / square<input type="number" min="1" max="100" value={feet} onChange={(event) => setFeet(Number(event.target.value))} /></label>
        </div>
        {error && <p className="combat-error">{error}</p>}
        <footer><button type="button" onClick={onCancel}>Cancel</button><button className="primary" disabled={busy} data-testid="create-encounter">{busy ? 'Creating…' : 'Create encounter'}</button></footer>
      </form>
    </div>
  );
}

function SetupModal({ encounter, map, tokens, onClose, onRefresh, onMap, onError }: {
  encounter: CombatEncounter;
  map: CombatMap | null;
  tokens: ReturnType<typeof useCombatEncounter>['tokens'];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onMap: (map: CombatMap) => void;
  onError: (value: string) => void;
}) {
  const [characters, setCharacters] = useState<Awaited<ReturnType<typeof listAvailableCharacters>>>([]);
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof listProfiles>>>([]);
  const [characterId, setCharacterId] = useState('');
  const [assigned, setAssigned] = useState('');
  const [team, setTeam] = useState('heroes');
  const [npcName, setNpcName] = useState('Goblin');
  const [npcHp, setNpcHp] = useState(7);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listAvailableCharacters(), listProfiles()])
      .then(([nextCharacters, nextProfiles]) => {
        setCharacters(nextCharacters);
        setProfiles(nextProfiles);
        setCharacterId(nextCharacters[0]?.id ?? '');
      })
      .catch((error) => onError(message(error)));
  }, [onError]);

  const perform = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try { await work(); await onRefresh(); }
    catch (error) { onError(message(error)); }
    finally { setBusy(false); }
  };

  return (
    <div className="combat-modal-backdrop">
      <div className="combat-modal combat-setup-modal">
        <header><div><Settings /><h2>Encounter setup</h2></div><button onClick={onClose}><X /></button></header>
        <section>
          <h3>Encounter</h3>
          <div className="field-grid three">
            <label>Status<select value={encounter.status} onChange={(event) => perform(() => updateEncounter(encounter.id, { status: event.target.value as CombatEncounter['status'] }))}>
              <option value="setup">Setup</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
            </select></label>
            <label>Mode<select value={encounter.turn_mode} onChange={(event) => perform(() => updateEncounter(encounter.id, { turn_mode: event.target.value as CombatEncounter['turn_mode'] }))}>
              <option value="initiative">Initiative</option><option value="free">Free</option>
            </select></label>
            <label>Round<input type="number" min="1" value={encounter.round_number} onChange={(event) => perform(() => updateEncounter(encounter.id, { round_number: Number(event.target.value) }))} /></label>
          </div>
        </section>
        <section>
          <h3>Map</h3>
          <div className="field-grid three">
            <label>Preset<select value={map?.preset_name ?? 'blank'} onChange={(event) => perform(async () => {
              const next = await updateMap(encounter.id, { map_type: 'preset', preset_name: event.target.value as CombatMap['preset_name'], storage_path: null });
              onMap(next);
            })}>
              <option value="blank">Blank</option><option value="grass">Grass</option><option value="stone">Stone</option><option value="dirt">Dirt</option>
            </select></label>
            <label>Columns<input type="number" min="5" max="100" value={map?.grid_columns ?? 24} onChange={(event) => perform(async () => onMap(await updateMap(encounter.id, { grid_columns: Number(event.target.value) })))} /></label>
            <label>Rows<input type="number" min="5" max="100" value={map?.grid_rows ?? 18} onChange={(event) => perform(async () => onMap(await updateMap(encounter.id, { grid_rows: Number(event.target.value) })))} /></label>
          </div>
          <label className="upload-map"><ImagePlus /> Upload JPG, PNG, or WebP (10 MB max)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void perform(async () => onMap(await uploadCombatMap(encounter.id, file)));
          }} /></label>
        </section>
        <section>
          <h3>Load Vault character</h3>
          <div className="setup-add-row">
            <select aria-label="Vault character" value={characterId} onChange={(event) => setCharacterId(event.target.value)}>
              {characters.map((character) => <option key={character.id} value={character.id}>{character.data.name}</option>)}
            </select>
            <select aria-label="Assigned player" value={assigned} onChange={(event) => setAssigned(event.target.value)}>
              <option value="">Unassigned / DM</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name || profile.email}</option>)}
            </select>
            <select aria-label="Combat team" value={team} onChange={(event) => setTeam(event.target.value)}>
              <option value="heroes">Heroes</option><option value="enemies">Enemies</option><option value="neutral">Neutral</option>
            </select>
            <button disabled={busy || !characterId} onClick={() => perform(async () => {
              const character = characters.find((item) => item.id === characterId);
              if (character) await addVaultToken(encounter.id, character, assigned || null, { x: tokens.length % 10, y: Math.floor(tokens.length / 10) }, team);
            })} data-testid="add-vault-character"><Plus /> Add</button>
          </div>
        </section>
        <section>
          <h3>Temporary NPC</h3>
          <div className="setup-add-row">
            <input value={npcName} onChange={(event) => setNpcName(event.target.value)} placeholder="Name" data-testid="npc-name" />
            <input type="number" min="1" value={npcHp} onChange={(event) => setNpcHp(Number(event.target.value))} data-testid="npc-hp" />
            <button disabled={busy} onClick={() => perform(() => addTemporaryToken(encounter.id, { name: npcName, hp: npcHp, assignedUserId: assigned || null, team }))} data-testid="add-npc"><Plus /> Add NPC</button>
          </div>
        </section>
        <section>
          <h3>Participants</h3>
          <div className="setup-token-list">
            {tokens.map((token) => <div key={token.id}><span>{token.name}<small>{token.character_id ? 'Vault character' : 'Temporary NPC'}</small></span>
              <span>{profiles.find((profile) => profile.id === token.assigned_user_id)?.display_name ?? 'DM / unassigned'}</span>
              <button onClick={() => perform(() => deleteToken(token.id))}>Remove</button></div>)}
          </div>
        </section>
        <footer><button className="primary" onClick={onClose} data-testid="setup-done">Done</button></footer>
      </div>
    </div>
  );
}

function EncounterView({ encounterId, session, onBack }: { encounterId: string; session: Session; onBack: () => void }) {
  const combat = useCombatEncounter(encounterId, session.user.id);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [actorId, setActorId] = useState('');
  const [targetMode, setTargetMode] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [areaTemplate, setAreaTemplate] = useState<AreaTemplate | null>(null);
  const [mobileView, setMobileView] = useState<'map' | 'panel'>('map');
  const encounter = combat.encounter;
  const isDm = encounter?.dm_user_id === session.user.id;

  useEffect(() => {
    const actors = combat.tokens.filter((token) => isDm || token.assigned_user_id === session.user.id);
    if (!actors.some((token) => token.id === actorId)) setActorId(actors[0]?.id ?? '');
  }, [combat.tokens, isDm, session.user.id, actorId]);

  const focusToken = (id: string) => setFocusRequest((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));

  if (combat.loading) return <div className="combat-loading">Loading shared encounter…</div>;
  if (!encounter) return <div className="combat-loading"><p>{combat.error || 'Encounter is unavailable.'}</p><button onClick={onBack}>Back</button></div>;

  return (
    <div className="combat-workspace">
      <header className="combat-header">
        <button onClick={onBack} title="Encounters"><ArrowLeft /></button>
        <div className="combat-title"><Swords /><span><strong>{encounter.name}</strong><small>Round {encounter.round_number} · {encounter.turn_mode} mode · {encounter.status}</small></span></div>
        <div className="combat-live">
          {combat.connection === 'live' ? <><Wifi /> Live</> : <><WifiOff /> Reconnecting</>}
          <span><Users /> {combat.onlineUsers.length} online</span>
        </div>
        <button className={targetMode ? 'targeting-button active' : 'targeting-button'} onClick={() => setTargetMode((active) => !active)} title="Click map tokens to add or remove targets">
          <Swords /><span>{targetMode ? 'Targeting On' : 'Select Targets'}</span>
        </button>
        {isDm && <button onClick={() => setShowSetup(true)} data-testid="open-setup"><Settings /><span>Setup</span></button>}
        <button className="mobile-switch" onClick={() => setMobileView((view) => view === 'map' ? 'panel' : 'map')}>
          {mobileView === 'map' ? <><Menu /> Combat panel</> : <><MapIcon /> Map</>}
        </button>
      </header>
      {combat.error && <div className="combat-save-error"><span>{combat.error}</span><button onClick={() => combat.setError(null)}>Dismiss</button></div>}
      <main className={`combat-layout mobile-${mobileView}`}>
        <MapBoard
          encounter={encounter}
          map={combat.map}
          tokens={combat.tokens}
          userId={session.user.id}
          isDm={isDm}
          selectedIds={selectedIds}
          targetIds={targetIds}
          actorId={actorId}
          targetMode={targetMode}
          focusRequest={focusRequest}
          areaTemplate={areaTemplate}
          onSelect={(id, addTarget) => {
            setSelectedIds([id]);
            if (addTarget) setTargetIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
          }}
          onMove={combat.moveOptimistically}
        />
        <CombatPanel
          encounter={encounter}
          map={combat.map}
          tokens={combat.tokens}
          proposals={combat.proposals}
          reactions={combat.reactions}
          events={combat.events}
          userId={session.user.id}
          isDm={isDm}
          actorId={actorId}
          selectedIds={selectedIds}
          targetIds={targetIds}
          areaTemplate={areaTemplate}
          targetMode={targetMode}
          onActorId={setActorId}
          onSelectedIds={setSelectedIds}
          onTargetIds={setTargetIds}
          onAreaTemplate={setAreaTemplate}
          onTargetMode={setTargetMode}
          onFocusToken={focusToken}
          onRefresh={combat.reload}
          onError={(value) => combat.setError(value)}
        />
      </main>
      {showSetup && isDm && (
        <SetupModal encounter={encounter} map={combat.map} tokens={combat.tokens}
          onClose={() => setShowSetup(false)} onRefresh={combat.reload} onMap={combat.setMap} onError={combat.setError} />
      )}
    </div>
  );
}

function EncounterHome({ session, onOpen, onClose }: {
  session: Session;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [encounters, setEncounters] = useState<CombatEncounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    listEncounters().then(setEncounters).catch((caught) => setError(message(caught))).finally(() => setLoading(false));
  }, []);
  return (
    <div className="combat-home">
      <header><div className="combat-brand"><Swords /><span><strong>Combat</strong><small>Homebrew Vault tactical encounters</small></span></div>
        <button onClick={onClose}><X /> Return to Vault</button></header>
      <main>
        <div className="combat-home-title"><div><h1>Your encounters</h1><p>Persistent tactical maps, permissive calculations, and DM-controlled resolutions.</p></div>
          <button className="primary" onClick={() => setCreating(true)} data-testid="new-encounter"><Plus /> New encounter</button></div>
        {error && <div className="combat-migration-warning">
          <Shield /><div><strong>Combat database is not ready</strong><p>{error}</p><small>Apply the versioned Supabase migration in this branch, then reload.</small></div>
        </div>}
        {loading ? <div className="combat-loading">Loading encounters…</div> : (
          <div className="encounter-grid">
            {encounters.map((encounter) => (
              <button key={encounter.id} onClick={() => onOpen(encounter.id)} data-testid={`encounter-card-${encounter.id}`}>
                <span className={`encounter-status status-${encounter.status}`}>{encounter.status}</span>
                <Swords /><strong>{encounter.name}</strong>
                <small>{encounter.turn_mode} mode · round {encounter.round_number}</small>
                <time>Updated {new Date(encounter.updated_at).toLocaleString()}</time>
              </button>
            ))}
            {!encounters.length && !error && <div className="empty-encounters"><MapIcon /><h2>No encounters yet</h2><p>Create one to load characters, place tokens, and invite campaign members.</p></div>}
          </div>
        )}
      </main>
      {creating && <EncounterCreate session={session} onCancel={() => setCreating(false)} onCreated={(encounter) => onOpen(encounter.id)} />}
    </div>
  );
}

export function CombatLauncher() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const close = () => { setOpen(false); setEncounterId(null); };
  if (!session) return null;
  if (!open) return <button className="combat-launcher" onClick={() => setOpen(true)} data-testid="combat-launcher"><Swords /><span>Combat</span></button>;
  return (
    <CombatErrorBoundary onClose={close}>
      <div className="combat-portal">
        {encounterId
          ? <EncounterView encounterId={encounterId} session={session} onBack={() => setEncounterId(null)} />
          : <EncounterHome session={session} onOpen={setEncounterId} onClose={close} />}
      </div>
    </CombatErrorBoundary>
  );
}
