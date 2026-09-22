import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emptyBook } from "@/lib/synaptick/paper";
import type { PaperBook, StrategyResult } from "@/lib/synaptick/types";

export type JournalEvent = {
  id: string;
  atMs: number;
  kind: "decision" | "paper" | "risk" | "scan" | "lab";
  symbol?: string;
  title: string;
  detail: string;
  decision?: string;
};

type Settings = {
  minConfidence: number;
  minNetEdge: number;
  riskPct: number;
  allowShorts: boolean;
};

type State = {
  book: PaperBook;
  setBook: (book: PaperBook) => void;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  tournament: StrategyResult[];
  setTournament: (rows: StrategyResult[]) => void;
  journal: JournalEvent[];
  log: (e: Omit<JournalEvent, "id" | "atMs">) => void;
  hydrated: boolean;
  setHydrated: () => void;
};

export const useAppStore = create<State>()(
  persist(
    (set, get) => ({
      book: emptyBook(),
      setBook: (book) => set({ book }),
      settings: { minConfidence: 60, minNetEdge: 0, riskPct: 1, allowShorts: false },
      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      tournament: [],
      setTournament: (rows) => set({ tournament: rows }),
      journal: [],
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      log: (e) =>
        set({
          journal: [
            {
              ...e,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              atMs: Date.now(),
            },
            ...get().journal,
          ].slice(0, 2000),
        }),
    }),
    {
      name: "synaptick-v1",
      skipHydration: true,
      partialize: ({ book, settings, tournament, journal }) => ({
        book,
        settings,
        tournament,
        journal,
      }),
    },
  ),
);
