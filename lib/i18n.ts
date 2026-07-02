"use client";

import { create } from "zustand";
import { MeetingStatus, MeetingType, Stage } from "./types";
import { setDateLocale } from "./utils";

// Lightweight i18n for the app. English is the default and lives inline at the
// call site; Swedish is passed alongside it: t("Contacts", "Kontakter"). No
// dictionary file to drift out of sync. Locale is per-device (localStorage).

export type Locale = "en" | "sv";

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const useLocale = create<LocaleState>((set) => ({
  // Default to "en" so the server render and the first client paint match
  // (initLocale upgrades it to the saved/browser locale after mount).
  locale: "en",
  setLocale: (locale) => {
    try {
      localStorage.setItem("emilcrm-locale", locale);
    } catch {}
    setDateLocale(locale);
    set({ locale });
  },
}));

/** Resolve the saved (or browser) locale on the client, after mount. */
export function initLocale(): void {
  let l: Locale = "en";
  try {
    const stored = localStorage.getItem("emilcrm-locale");
    if (stored === "sv" || stored === "en") l = stored;
    else if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("sv")) l = "sv";
  } catch {}
  setDateLocale(l);
  if (l !== useLocale.getState().locale) useLocale.setState({ locale: l });
}

/** Hook → `t("English", "Svenska")` returns the active-locale string. */
export function useT() {
  const locale = useLocale((s) => s.locale);
  return (en: string, sv: string) => (locale === "sv" ? sv : en);
}

/** Swedish labels for the booking pipeline stages (English lives in STAGE_META). */
export const STAGE_LABEL_SV: Record<Stage, string> = {
  to_contact: "Att kontakta",
  contacted: "Kontaktad",
  scheduling: "Planerar",
  booked: "Möte bokat",
  met: "Träffad",
  follow_up: "Uppföljning",
  won: "Vunnen",
  lost: "Förlorad",
};

/** Meeting status labels (English + Swedish). */
export const MEETING_STATUS_LABEL: Record<MeetingStatus, { en: string; sv: string }> = {
  scheduled: { en: "Scheduled", sv: "Inbokat" },
  completed: { en: "Completed", sv: "Genomfört" },
  cancelled: { en: "Cancelled", sv: "Inställt" },
  no_show: { en: "No-show", sv: "Uteblev" },
};

/** Swedish labels for meeting types (English lives in MEETING_TYPE_META). */
export const MEETING_TYPE_SV: Record<MeetingType, string> = {
  video: "Videomöte",
  call: "Telefonsamtal",
  in_person: "På plats",
};
