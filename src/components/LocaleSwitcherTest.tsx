"use client";

import React from 'react';
import { useI18n } from "@/src/components/I18nProvider";

export function LocaleSwitcherTest() {
  const { setLocale } = useI18n();

  return (
    <div style={{ padding: '10px', background: '#f0f0f0', marginBottom: '10px', marginTop: '10px' }}>
      <button onClick={() => setLocale('en')}>Switch to English</button>
      <button onClick={() => setLocale('es')}>Switch to Español</button>
    </div>
  );
}
