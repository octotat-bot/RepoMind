"use client";

import { create } from "zustand";
import { api, setUnauthorizedHandler, tokens } from "@/lib/api";

/**
 * Session state.
 *
 * `status` distinguishes "we haven't checked yet" from "definitely signed out",
 * which is what stops protected pages from flashing the login screen on reload.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  status: "loading", // loading | authenticated | anonymous

  async bootstrap() {
    if (!tokens.access() && !tokens.refresh()) {
      set({ status: "anonymous", user: null });
      return null;
    }
    try {
      const user = await api.auth.me();
      set({ user, status: "authenticated" });
      return user;
    } catch {
      tokens.clear();
      set({ user: null, status: "anonymous" });
      return null;
    }
  },

  async login(email, password) {
    const data = await api.auth.login({ email, password });
    tokens.save(data.tokens);
    set({ user: data.user, status: "authenticated" });
    return data.user;
  },

  async register(name, email, password) {
    const data = await api.auth.register({ name, email, password });
    tokens.save(data.tokens);
    set({ user: data.user, status: "authenticated" });
    return data.user;
  },

  logout() {
    tokens.clear();
    set({ user: null, status: "anonymous" });
  },

  async updateProfile(payload) {
    const user = await api.auth.updateProfile(payload);
    set({ user });
    return user;
  },

  isAuthenticated: () => get().status === "authenticated",
}));

// Any unrecoverable 401 anywhere in the app drops the session exactly once.
setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null, status: "anonymous" });
});
