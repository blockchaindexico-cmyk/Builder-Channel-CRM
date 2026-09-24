"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

import {
  DEFAULT_REGIONAL_SETTINGS,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRelative,
  formatTime,
  type RegionalFormatSettings,
} from "@/lib/format";

const RegionalSettingsContext = createContext<RegionalFormatSettings>(DEFAULT_REGIONAL_SETTINGS);

/** Makes the organization's regional settings available to client components. */
export function RegionalSettingsProvider({
  value,
  children,
}: {
  value: RegionalFormatSettings;
  children: ReactNode;
}) {
  return (
    <RegionalSettingsContext.Provider value={value}>{children}</RegionalSettingsContext.Provider>
  );
}

export function useRegionalSettings(): RegionalFormatSettings {
  return useContext(RegionalSettingsContext);
}

/** Formatters bound to the organization's timezone, currency and locale. */
export function useFormatters() {
  const settings = useRegionalSettings();
  return useMemo(
    () => ({
      money: (
        value: Parameters<typeof formatMoney>[0],
        options?: Parameters<typeof formatMoney>[2],
      ) => formatMoney(value, settings, options),
      number: (value: number | null | undefined, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, settings, options),
      date: (value: Parameters<typeof formatDate>[0]) => formatDate(value, settings),
      dateTime: (value: Parameters<typeof formatDateTime>[0]) => formatDateTime(value, settings),
      time: (value: Parameters<typeof formatTime>[0]) => formatTime(value, settings),
      relative: (value: Parameters<typeof formatRelative>[0]) => formatRelative(value),
    }),
    [settings],
  );
}
