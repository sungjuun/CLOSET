export type CategoryDragHandleProps = {
  label: string; containerId: string; disabled: boolean; active: boolean; position: number; count: number;
  onStart: () => boolean; onMove: (dy: number) => void; onStep: (direction: -1 | 1) => void;
  onEnd: () => void; onCancel: () => void;
};
