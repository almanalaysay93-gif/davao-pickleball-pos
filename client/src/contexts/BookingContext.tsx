import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * Holds the in-progress booking selection as users move through
 * Schedule → Book → Checkout → Confirmation.
 */
export type BookingDraft = {
  venueId: number | null;
  courtId: number | null;
  courtNumber: string | null;
  venueName: string | null;
  playerDate: string | null;
  startHour: string | null;
  endHour: string | null;
  playerName: string | null;
  contact: string | null;
  dayAmount: number | null;
  nightAmount: number | null;
  total: number | null;
  channel: "online" | "walkin";
};

type BookingContextValue = {
  draft: BookingDraft;
  setDraft: (patch: Partial<BookingDraft>) => void;
  resetDraft: () => void;
};

const initialDraft: BookingDraft = {
  venueId: null,
  courtId: null,
  courtNumber: null,
  venueName: null,
  playerDate: null,
  startHour: null,
  endHour: null,
  playerName: null,
  contact: null,
  dayAmount: null,
  nightAmount: null,
  total: null,
  channel: "online",
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<BookingDraft>(initialDraft);
  const value = useMemo(
    () => ({
      draft,
      setDraft: (patch: Partial<BookingDraft>) =>
        setDraftState(prev => ({ ...prev, ...patch })),
      resetDraft: () => setDraftState(initialDraft),
    }),
    [draft],
  );
  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
}
