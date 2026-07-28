import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, HelpCircle, Minus, Plus, RotateCcw, Target } from 'lucide-react';
import type { AreaTemplate, CombatEncounter, CombatMap, CombatToken } from '../../types/combat';
import { canMoveCombatToken } from '../../lib/combat/permissions';

interface Props {
  encounter: CombatEncounter;
  map: CombatMap | null;
  tokens: CombatToken[];
  userId: string;
  isDm: boolean;
  selectedIds: string[];
  targetIds: string[];
  actorId: string;
  targetMode: boolean;
  focusRequest: { id: string; nonce: number } | null;
  areaTemplate: AreaTemplate | null;
  onSelect: (id: string, addTarget: boolean) => void;
  onMove: (token: CombatToken, x: number, y: number) => Promise<boolean>;
}

const parseSpeed = (speed: unknown) => {
  const match = String(speed ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
};

function presetBackground(name: CombatMap['preset_name']) {
  switch (name) {
    case 'grass':
      return 'linear-gradient(135deg, #315c2d 25%, #3b6b35 25%, #3b6b35 50%, #315c2d 50%, #315c2d 75%, #3b6b35 75%)';
    case 'stone':
      return 'linear-gradient(135deg, #27272a 25%, #3f3f46 25%, #3f3f46 50%, #27272a 50%, #27272a 75%, #3f3f46 75%)';
    case 'dirt':
      return 'linear-gradient(135deg, #5b3b25 25%, #6f4b2f 25%, #6f4b2f 50%, #5b3b25 50%, #5b3b25 75%, #6f4b2f 75%)';
    default:
      return '#18181b';
  }
}

export function MapBoard({
  encounter,
  map,
  tokens,
  userId,
  isDm,
  selectedIds,
  targetIds,
  actorId,
  targetMode,
  focusRequest,
  areaTemplate,
  onSelect,
  onMove,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{
    token: CombatToken;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
    distance: number;
  } | null>(null);
  const cell = 48;
  const columns = map?.grid_columns ?? 24;
  const rows = map?.grid_rows ?? 18;
  const feet = map?.feet_per_square ?? 5;
  const activeId = encounter.active_turn_token_id;
  const actor = tokens.find((token) => token.id === actorId);
  const selectedNames = selectedIds.map((id) => tokens.find((token) => token.id === id)?.name).filter(Boolean);
  const targetNames = targetIds.map((id) => tokens.find((token) => token.id === id)?.name).filter(Boolean);

  const background = useMemo(() => {
    const grid = [
      'linear-gradient(to right, rgba(255,255,255,.14) 1px, transparent 1px)',
      'linear-gradient(to bottom, rgba(255,255,255,.14) 1px, transparent 1px)',
    ].join(',');
    const base = map?.map_type === 'upload' && map.signedUrl
      ? `url("${map.signedUrl}") center / 100% 100% no-repeat`
      : `${presetBackground(map?.preset_name ?? 'blank')} 0 0 / 96px 96px`;
    return `${grid}, ${base}`;
  }, [map]);

  const canMove = (token: CombatToken) => canMoveCombatToken(token, userId, isDm);

  useEffect(() => {
    if (!focusRequest || !viewportRef.current) return;
    const token = tokens.find((item) => item.id === focusRequest.id);
    if (!token) return;
    const viewport = viewportRef.current.getBoundingClientRect();
    setPan({
      x: viewport.width / 2 - (token.x + token.width_squares / 2) * cell * zoom,
      y: viewport.height / 2 - (token.y + token.height_squares / 2) * cell * zoom,
    });
  }, [focusRequest?.nonce]);

  const beginTokenDrag = (event: React.PointerEvent, token: CombatToken) => {
    event.stopPropagation();
    onSelect(token.id, targetMode || event.shiftKey);
    if (!canMove(token)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ token, pointerX: event.clientX, pointerY: event.clientY, x: token.x, y: token.y, distance: 0 });
  };

  const continueTokenDrag = (event: React.PointerEvent) => {
    if (!drag) return;
    const dx = (event.clientX - drag.pointerX) / (cell * zoom);
    const dy = (event.clientY - drag.pointerY) / (cell * zoom);
    const x = Math.max(0, Math.min(columns - drag.token.width_squares, Math.round(drag.token.x + dx)));
    const y = Math.max(0, Math.min(rows - drag.token.height_squares, Math.round(drag.token.y + dy)));
    const distance = Math.max(Math.abs(x - drag.token.x), Math.abs(y - drag.token.y)) * feet;
    setDrag({ ...drag, x, y, distance });
  };

  const finishTokenDrag = async () => {
    if (!drag) return;
    const move = drag;
    setDrag(null);
    if (move.x !== move.token.x || move.y !== move.token.y) {
      await onMove(move.token, move.x, move.y);
    }
  };

  const tokenPosition = (token: CombatToken) => {
    if (drag?.token.id === token.id) return { x: drag.x, y: drag.y };
    return { x: token.x, y: token.y };
  };

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-token]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning({ startX: event.clientX, startY: event.clientY, x: pan.x, y: pan.y });
  };

  return (
    <section className="combat-map-shell">
      <div className="combat-map-toolbar">
        <button onClick={() => setZoom((value) => Math.max(.4, value - .1))} title="Zoom out"><Minus /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((value) => Math.min(2.5, value + .1))} title="Zoom in"><Plus /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 24, y: 24 }); }} title="Reset view"><RotateCcw /></button>
        <span className="combat-map-scale"><Crosshair /> {feet} ft / square</span>
        <span className={targetMode ? 'target-mode active' : 'target-mode'}><Target /> {targetMode ? 'Targeting mode' : 'Select mode'}</span>
        <span className="map-selection-summary" title={`Selected: ${selectedNames.join(', ') || 'none'}; Targets: ${targetNames.join(', ') || 'none'}`}>
          Selected: {selectedNames.join(', ') || 'none'} · Targets: {targetNames.join(', ') || 'none'}
        </span>
        <span className="map-help" title="Click selects. Turn on targeting mode or hold Shift while clicking to add or remove targets. Drag a token you control to move it."><HelpCircle /></span>
        {drag && (
          <span className={parseSpeed(drag.token.state.speed) !== null && drag.distance > parseSpeed(drag.token.state.speed)! ? 'movement-warning' : 'movement-distance'}>
            {drag.distance} ft
            {parseSpeed(drag.token.state.speed) !== null && drag.distance > parseSpeed(drag.token.state.speed)!
              ? ` — over listed ${parseSpeed(drag.token.state.speed)} ft speed`
              : ''}
          </span>
        )}
      </div>
      <div
        ref={viewportRef}
        className={`combat-map-viewport ${targetMode ? 'targeting' : ''}`}
        data-testid="combat-map-viewport"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) => Math.max(.4, Math.min(2.5, value - event.deltaY * .001)));
        }}
        onPointerDown={beginPan}
        onPointerMove={(event) => {
          if (panning) setPan({ x: panning.x + event.clientX - panning.startX, y: panning.y + event.clientY - panning.startY });
        }}
        onPointerUp={() => setPanning(null)}
        onPointerCancel={() => setPanning(null)}
      >
        <div
          className="combat-grid"
          style={{
            width: columns * cell,
            height: rows * cell,
            background,
            backgroundSize: `${cell}px ${cell}px, ${cell}px ${cell}px, ${map?.map_type === 'upload' ? '100% 100%' : '96px 96px'}`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {areaTemplate && (
            <div
              className={`area-template area-${areaTemplate.shape}`}
              style={{
                left: areaTemplate.x * cell,
                top: areaTemplate.y * cell,
                width: areaTemplate.width * cell,
                height: areaTemplate.height * cell,
                transform: `rotate(${areaTemplate.rotation ?? 0}deg)`,
              }}
            />
          )}
          {tokens.filter((token) => token.visible || isDm).map((token) => {
            const position = tokenPosition(token);
            const hp = token.state.hp ?? { current: 0, max: 1, temp: 0 };
            const percent = Math.max(0, Math.min(100, (hp.current / Math.max(1, hp.max)) * 100));
            const selected = selectedIds.includes(token.id);
            const targeted = targetIds.includes(token.id);
            const targetOrder = targetIds.indexOf(token.id) + 1;
            const current = activeId === token.id;
            const acting = actorId === token.id;
            const relationship = actor && token.id !== actor.id
              ? token.team === actor.team ? 'ally' : 'enemy'
              : '';
            const portrait = token.state.portraitUrl;
            const dead = token.state.dead || hp.current <= 0;
            return (
              <button
                key={token.id}
                data-token
                data-testid={`map-token-${token.id}`}
                aria-label={`${token.name}, ${acting ? 'acting combatant, ' : ''}${targeted ? `target ${targetOrder}, ` : ''}${hp.current} of ${hp.max} HP`}
                className={[
                  'map-token',
                  selected ? 'selected' : '',
                  targeted ? 'targeted' : '',
                  acting ? 'actor' : '',
                  current ? 'current-turn' : '',
                  relationship,
                  dead ? 'dead' : '',
                  canMove(token) ? 'controllable' : '',
                ].join(' ')}
                style={{
                  left: position.x * cell,
                  top: position.y * cell,
                  width: token.width_squares * cell,
                  height: token.height_squares * cell,
                  transform: `rotate(${token.rotation}deg)`,
                }}
                onPointerDown={(event) => beginTokenDrag(event, token)}
                onPointerMove={continueTokenDrag}
                onPointerUp={finishTokenDrag}
                onPointerCancel={() => setDrag(null)}
                title={`${token.name} — ${hp.current}/${hp.max} HP${token.assigned_user_id ? '' : ' — unassigned'}`}
              >
                <span
                  className="token-face"
                  style={portrait ? { backgroundImage: `url("${portrait}")` } : undefined}
                >
                  {!portrait && token.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="token-name">{token.name}</span>
                <span className="token-hp"><i style={{ width: `${percent}%` }} /></span>
                {targeted && <span className="token-target-order" aria-hidden="true">{targetOrder}</span>}
                {acting && <span className="token-role-label">ACTOR</span>}
                {hp.temp > 0 && <span className="token-temp">+{hp.temp}</span>}
                {!!token.state.conditions?.length && <span className="token-conditions">{token.state.conditions.length}</span>}
                {token.state.unconscious && <span className="token-state">UNCONSCIOUS</span>}
                {dead && <span className="token-state">DEAD</span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
