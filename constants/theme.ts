export const theme = {
  colors: {
    // Brand
    primary: '#1A2238',
    primaryDark: '#111828',

    // Text
    text: '#1C1917',
    textSecondary: '#44403C',
    textMuted: '#78716C',
    textLight: '#A8A29E',
    textPlaceholder: '#C4BAB2',

    // Surfaces & borders
    border: '#E7DDD4',
    borderLight: '#EFE8E0',
    inputBg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceWarm: '#F5EFE6',   // warm tinted card (info banners, etc.)
    background: '#FAF7F2',    // warm cream app bg

    // Semantic
    danger: '#DC2626',
    dangerBg: '#FEF2F2',
    success: '#2F7D3B',
    successBg: '#F0FFF4',

    // Overlay
    backdrop: 'rgba(28,25,23,0.52)',
  },
  radius: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    pill: 100,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#1A2238',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  md: {
    shadowColor: '#1A2238',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 3,
  },
};
