export const theme = {
  colors: {
    primary: '#111111',
    text: '#111111',
    textSecondary: '#444444',
    textMuted: '#666666',
    textLight: '#999999',
    textPlaceholder: '#BBBBBB',
    border: '#E8E8E4',
    borderLight: '#F0F0EC',
    inputBg: '#FFFFFF',
    surface: '#FFFFFF',
    background: '#F7F7F5',
    danger: '#CC2222',
    success: '#1A7A3C',
    successBg: '#EBF5EF',
  },
  radius: {
    xs: 6,
    sm: 10,
    md: 12,
    lg: 14,
    xl: 20,
    xxl: 24,
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
};
