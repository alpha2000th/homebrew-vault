import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not expose PointerEvent by default, while the tactical map uses
// pointer input so one interaction path works for mouse, pen, and touch.
Object.defineProperty(window, 'PointerEvent', { value: MouseEvent });

afterEach(() => cleanup());
