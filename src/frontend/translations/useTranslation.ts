import { useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getUiLang,
  getUiString,
  interpolate as interpolateUtil,
  type UiLang,
} from './ui';

// Vocab: customizable Arknights terms. Edit data/arknights-vocab.json and copy to this path to apply.
import arknightsVocab from './arknights-vocab.json';

// Niche/synergy name and description translations.
import nicheTranslations from './niche-translations.json';

type VocabEntry = { en: string; cn: string; tw: string };
const vocabMap = arknightsVocab as Record<string, VocabEntry>;

type NicheEntry = { cn?: { name?: string; description?: string }; tw?: { name?: string; description?: string } };
const nicheMap = nicheTranslations as Record<string, NicheEntry>;

function getVocabLang(language: string): UiLang {
  if (language === 'cn' || language === 'tw') return language;
  return 'en';
}

function getVocabTerm(key: string, lang: UiLang): string {
  const entry = vocabMap[key];
  if (!entry) return key;
  const val = entry[lang] ?? entry.en;
  return typeof val === 'string' ? val : key;
}

export function useTranslation() {
  const { language } = useLanguage();
  const uiLang = useMemo(() => getUiLang(language), [language]);
  const vocabLang = useMemo(() => getVocabLang(language), [language]);

  const t = useMemo(
    () => (key: string) => getUiString(uiLang, key),
    [uiLang]
  );

  const vocab = useMemo(
    () => (termKey: string) => getVocabTerm(termKey, vocabLang),
    [vocabLang]
  );

  const translateClass = useMemo(
    () => (className: string) => {
      const key = 'class_' + className;
      return getVocabTerm(key, vocabLang);
    },
    [vocabLang]
  );

  const translateRating = useMemo(
    () => (rating: string) => {
      const key = 'rating_' + rating;
      return getVocabTerm(key, vocabLang);
    },
    [vocabLang]
  );

  const interpolate = useMemo(
    () => (template: string, vars: Record<string, string | number>) =>
      interpolateUtil(template, vars),
    []
  );

  const getNicheName = useMemo(
    () => (filename: string, fallback: string) => {
      const entry = nicheMap[filename];
      if (!entry || uiLang === 'en') return fallback;
      const tr = entry[uiLang];
      return (tr?.name && tr.name.trim()) ? tr.name : fallback;
    },
    [uiLang]
  );

  const getNicheDescription = useMemo(
    () => (filename: string, fallback: string) => {
      const entry = nicheMap[filename];
      if (!entry || uiLang === 'en') return fallback;
      const tr = entry[uiLang];
      return (tr?.description && tr.description.trim()) ? tr.description : fallback;
    },
    [uiLang]
  );

  return {
    t,
    vocab,
    translateClass,
    translateRating,
    interpolate,
    getNicheName,
    getNicheDescription,
    language,
    uiLang,
  };
}
