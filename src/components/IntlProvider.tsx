"use client";

import { NextIntlClientProvider, useMessages } from "next-intl";
import { useMemo } from "react";

export function IntlProvider({ children, messages }: { children: React.ReactNode; messages: any }) {
  const contextValue = useMemo(() => ({ messages }), [messages]);

  return (
    <NextIntlClientProvider messages={contextValue.messages}>
      {children}
    </NextIntlClientProvider>
  );
}