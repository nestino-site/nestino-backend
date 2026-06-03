/**
 * Per-locale tone overrides. Injected into the system prompt for generate/draft steps
 * when the content language matches. These tune writing style to cultural expectations.
 */
const LOCALE_TONES: Record<string, string> = {
  en: 'Tone: Direct and helpful. Conversational but informative. Avoid jargon. Use active voice. Keep sentences short and punchy.',
  ar: 'الأسلوب: احترافي ومحترم. استخدم لغة عربية فصيحة سليمة. تجنب التعابير العامية. كن واضحاً ودقيقاً في المعلومات العملية.',
  de: 'Ton: Sachlich, präzise und höflich. Ausführliche Erklärungen sind willkommen. Verwende formelles Deutsch (Sie-Form). Direkte Empfehlungen werden geschätzt.',
  fr: 'Ton: Élégant et informatif. Utilisez un français soutenu mais accessible. Privilégiez les conseils pratiques avec nuance. Évitez la familiarité excessive.',
  es: 'Tono: Cálido y accesible. Use un español neutro (sin regionalismos extremos). Sea directo y útil. Incluya recomendaciones prácticas.',
  it: "Tono: Caldo e descrittivo. Italiano standard e chiaro. Include dettagli pratici e suggerimenti basati sull'esperienza.",
  tr: 'Ton: Profesyonel ve bilgilendirici. Açık Türkçe kullanın. Pratik ipuçlarına ve gerçekçi detaylara odaklanın.',
  nl: 'Toon: Nuchter, direct en to-the-point. Gebruik verzorgd Nederlands. Vermijd overdrijving. Geef concrete aanbevelingen.',
  fa: 'لحن: حرفه‌ای و مودبانه. از فارسی رسمی و روان استفاده کنید. اطلاعات عملی را با وضوح بیان کنید.',
};

export function getLocaleTone(language: string): string {
  const key = language.toLowerCase().split('-')[0];
  return LOCALE_TONES[key] ?? LOCALE_TONES['en'];
}
