/// Game-neutral pacing constants shared by the server simulation and the
/// client formats. The simulation advances a single abstract "progress"
/// quantity; each format reinterprets it (F1 laps, raid damage stacks, …).
/// One progress unit is one F1 lap in the original vocabulary.

/** Progress at which the leader finishes the round (the old F1 `totalLaps`). */
export const progressTarget = 58;

/** Nominal seconds to accrue one progress unit at pace 1.0 (old `baseLapDuration`). */
export const baseProgressDuration = 18;
