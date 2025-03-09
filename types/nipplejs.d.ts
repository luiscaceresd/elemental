declare module 'nipplejs' {
  interface JoystickManagerOptions {
    zone: HTMLElement;
    mode?: string;
    position?: { left?: string; top?: string; bottom?: string; right?: string };
    color?: string;
    size?: number;
    threshold?: number;
    fadeTime?: number;
    multitouch?: boolean;
    maxNumberOfNipples?: number;
    dataOnly?: boolean;
    restOpacity?: number;
    lockX?: boolean;
    lockY?: boolean;
  }

  interface JoystickInstance {
    on(event: string, callback: (evt: any, data: any) => void): void;
    off(event: string, callback?: (evt: any, data: any) => void): void;
    destroy(): void;
  }

  interface JoystickManager extends JoystickInstance {
    create(options?: JoystickManagerOptions): JoystickInstance[];
    get(id?: number): JoystickInstance;
    destroy(): void;
  }

  export function create(options: JoystickManagerOptions): JoystickManager;

  export default {
    create
  };
} 