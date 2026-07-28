import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CombatEncounter, CombatMap, CombatToken } from '../../types/combat';
import { MapBoard } from './MapBoard';

const encounter: CombatEncounter = {
  id: 'encounter',
  campaign_id: null,
  dm_user_id: 'dm',
  name: 'Test',
  status: 'active',
  turn_mode: 'initiative',
  round_number: 1,
  active_turn_token_id: 'token',
  settings: {},
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const map: CombatMap = {
  id: 'map',
  encounter_id: 'encounter',
  map_type: 'preset',
  storage_path: null,
  preset_name: 'stone',
  grid_columns: 10,
  grid_rows: 10,
  feet_per_square: 5,
  settings: {},
};

const token: CombatToken = {
  id: 'token',
  encounter_id: 'encounter',
  character_id: null,
  assigned_user_id: 'player-a',
  name: 'Alphy',
  team: 'heroes',
  initiative: 18,
  initiative_order: 0,
  x: 1,
  y: 1,
  width_squares: 1,
  height_squares: 1,
  rotation: 0,
  visible: true,
  state: {
    hp: { current: 30, max: 40, temp: 5 },
    conditions: ['Prone'],
    resourcePools: [],
    speed: '30 ft',
  },
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

describe('MapBoard', () => {
  it('renders visible tactical state and allows target selection', () => {
    const onSelect = vi.fn();
    render(<MapBoard encounter={encounter} map={map} tokens={[token]} userId="player-b" isDm={false}
      selectedIds={[]} targetIds={[]} actorId="" targetMode={false} focusRequest={null}
      areaTemplate={null} onSelect={onSelect} onMove={vi.fn()} />);
    const tokenButton = screen.getByTitle('Alphy — 30/40 HP');
    expect(tokenButton).toHaveTextContent('Alphy');
    expect(tokenButton).toHaveTextContent('+5');
    fireEvent.pointerDown(tokenButton, { shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith('token', true);
  });

  it('does not begin movement for a different player’s token', () => {
    const onMove = vi.fn();
    render(<MapBoard encounter={encounter} map={map} tokens={[token]} userId="player-b" isDm={false}
      selectedIds={[]} targetIds={[]} actorId="" targetMode={false} focusRequest={null}
      areaTemplate={null} onSelect={vi.fn()} onMove={onMove} />);
    const tokenButton = screen.getByTitle('Alphy — 30/40 HP');
    fireEvent.pointerDown(tokenButton, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(tokenButton, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(tokenButton);
    expect(onMove).not.toHaveBeenCalled();
  });
});
