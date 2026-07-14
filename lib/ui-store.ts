"use client";

import { create } from "zustand";
import { uid } from "./utils";

export type Modal =
  | { kind: "none" }
  | { kind: "add-contact" }
  | { kind: "edit-contact"; contactId: string }
  | { kind: "import-prospect" }
  | { kind: "campaign"; campaignId?: string }
  | { kind: "next-action"; contactId: string }
  | { kind: "book-meeting"; contactId?: string }
  | { kind: "data-backup" };

export interface Toast {
  id: string;
  message: string;
}

/** "all" shows every campaign; otherwise scope the app to one campaign id. */
export type ActiveCampaign = string | "all";

interface UIState {
  modal: Modal;
  toasts: Toast[];
  activeCampaignId: ActiveCampaign;
  /** Mobile nav drawer (below the lg breakpoint). Desktop ignores it. */
  mobileNavOpen: boolean;
  setMobileNav: (open: boolean) => void;
  setActiveCampaign: (id: ActiveCampaign) => void;
  openModal: (modal: Modal) => void;
  closeModal: () => void;
  toast: (message: string) => void;
  dismissToast: (id: string) => void;
}

export const useUI = create<UIState>((set) => ({
  modal: { kind: "none" },
  toasts: [],
  activeCampaignId: "all",
  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  setActiveCampaign: (id) => {
    // Persist per-device so a refresh keeps the selection (validated on restore).
    try {
      localStorage.setItem("emilcrm-active-campaign", id);
    } catch {}
    set({ activeCampaignId: id });
  },
  // Opening a modal also dismisses the mobile drawer (e.g. tapping "Add contact"
  // in the drawer should reveal the modal, not leave the drawer covering it).
  openModal: (modal) => set({ modal, mobileNavOpen: false }),
  closeModal: () => set({ modal: { kind: "none" } }),
  toast: (message) => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
